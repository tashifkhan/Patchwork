import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { dictationBlocker, transcribeBrainDump } from '@/api/ai';
import { ApiError } from '@/api/client';
import { MicPulse } from '@/components/tasks/dictation-sheet';
import { useTheme } from '@/components/theme/context';
import { ElasticPressable, TurningChevron } from '@/components/ui/motion';
import { ProgressOverlay } from '@/components/ui/progress-overlay';
import { sheetOverlayStyle, useSheetPanel } from '@/components/ui/sheet-panel';
import {
  OFFLINE_DICTATION_MESSAGE,
  SLOW_DICTATION_MESSAGE,
  checkConnection,
  isNetworkError,
} from '@/lib/connectivity';
import { haptics } from '@/lib/haptics';
import { COLLAPSE_OUT, DURATION, EASING, EXPAND_IN } from '@/lib/motion';
import {
  MAX_SECONDS,
  RECORDING,
  RECORDING_MIME_TYPE,
  SPEECH_DB,
  formatRecordingClock,
  meterToLevel,
} from '@/lib/voice-recording';
import { Text, TextInput, View } from '@/tw';

type Phase = 'starting' | 'recording' | 'working' | 'review' | 'error';
type ErrorKind = 'retry' | 'permission' | 'ai-setup' | 'network';

/**
 * Talk a brain dump instead of typing it. Opening the sheet starts the mic;
 * Done sends the audio to an audio-capable model, which transcribes it and
 * tidies it into one thought per line. You can edit the lines, then they're
 * added to today's page, ready to sort like anything typed.
 */
export function VoiceDumpSheet({
  visible,
  onClose,
  onAdd,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (lines: string) => void;
}) {
  const { colors } = useTheme();
  const panel = useSheetPanel(16);
  const recorder = useAudioRecorder(RECORDING);
  const status = useAudioRecorderState(recorder, 80);
  const [phase, setPhase] = useState<Phase>('starting');
  const [message, setMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>('retry');
  const [refined, setRefined] = useState('');
  const [transcript, setTranscript] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const cancelled = useRef(false);
  const peakDb = useRef<number | null>(null);

  const fail = useCallback((kind: ErrorKind, text: string) => {
    setErrorKind(kind);
    setMessage(text);
    setPhase('error');
  }, []);

  const start = useCallback(async () => {
    cancelled.current = false;
    peakDb.current = null;
    setMessage(null);
    setErrorKind('retry');
    setShowTranscript(false);
    setPhase('starting');
    const blocker = dictationBlocker();
    if (blocker) {
      haptics.error();
      fail('ai-setup', blocker.message.replace('Dictation', 'Voice brain dumps').replace('dictation', 'voice brain dumps'));
      return;
    }
    try {
      const [permission, connection] = await Promise.all([
        requestRecordingPermissionsAsync(),
        checkConnection({ timeoutMs: 5000, slowMs: 2500 }),
      ]);
      if (cancelled.current) return;
      if (!permission.granted) {
        fail(permission.canAskAgain ? 'retry' : 'permission', 'Allow microphone access to talk out a brain dump.');
        return;
      }
      if (connection !== 'online') {
        haptics.error();
        fail('network', connection === 'offline' ? OFFLINE_DICTATION_MESSAGE : SLOW_DICTATION_MESSAGE);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (cancelled.current) return;
      recorder.record();
      haptics.impact('medium');
      setPhase('recording');
    } catch (error) {
      fail('retry', error instanceof Error ? error.message : 'Could not start the microphone.');
    }
  }, [fail, recorder]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => void start(), dictationBlocker() ? 0 : 250);
    return () => clearTimeout(timer);
  }, [visible, start]);

  const release = useCallback(async () => {
    try {
      if (recorder.getStatus().isRecording) await recorder.stop();
    } catch {
      // Already stopped.
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  }, [recorder]);

  async function close() {
    cancelled.current = true;
    await release();
    setPhase('starting');
    setRefined('');
    setTranscript('');
    onClose();
  }

  async function finish() {
    if (phase !== 'recording') return;
    const seconds = recorder.getStatus().durationMillis / 1000;
    await release();
    const uri = recorder.uri;
    if (!uri || seconds < 0.8) {
      fail('retry', "That was too short. Tap the mic and say what's on your mind.");
      return;
    }
    if (peakDb.current != null && peakDb.current < SPEECH_DB) {
      haptics.error();
      fail('retry', "I couldn't hear anything. Check the microphone isn't muted and try again.");
      return;
    }
    haptics.tap();
    setPhase('working');
    try {
      const result = await transcribeBrainDump({ uri, mimeType: RECORDING_MIME_TYPE });
      if (cancelled.current) return;
      if (!result.refined) {
        haptics.error();
        fail('retry', "The AI couldn't make out any words. Try again a little closer to the phone.");
        return;
      }
      haptics.success();
      setRefined(result.refined);
      setTranscript(result.transcript);
      setPhase('review');
    } catch (error) {
      if (cancelled.current) return;
      haptics.error();
      const network = isNetworkError(error);
      fail(
        network ? 'network' : 'retry',
        network && !(error instanceof ApiError && error.status === 0)
          ? SLOW_DICTATION_MESSAGE
          : error instanceof Error
            ? error.message
            : 'Could not reach the AI.'
      );
    }
  }

  function add() {
    const lines = refined
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');
    if (!lines) return;
    haptics.success();
    onAdd(lines);
    void close();
  }

  useEffect(() => () => void release(), [release]);

  useEffect(() => {
    if (status.isRecording && typeof status.metering === 'number') {
      peakDb.current = Math.max(peakDb.current ?? -160, status.metering);
    }
  }, [status.isRecording, status.metering]);

  const seconds = Math.floor(status.durationMillis / 1000);
  const remaining = MAX_SECONDS - seconds;
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setTimeout(() => void finishRef.current(), MAX_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  const recording = phase === 'recording';
  const reviewing = phase === 'review';
  const lineCount = refined.split('\n').filter((line) => line.trim()).length;

  const title = recording
    ? 'Listening…'
    : reviewing
      ? `${lineCount} thought${lineCount === 1 ? '' : 's'}`
      : phase === 'error'
        ? errorKind === 'network' || errorKind === 'ai-setup'
          ? 'Voice unavailable'
          : 'Talk it out'
        : 'Getting the mic ready…';
  const subtitle = reviewing
    ? 'Cleaned up from what you said. Edit anything, then add it to today.'
    : phase === 'error' && message
      ? message
      : 'Ramble. Errands, ideas, worries, all of it. Filler and false starts get cleaned up.';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => void close()}>
      <Animated.View entering={FadeIn.duration(DURATION.short4)} style={sheetOverlayStyle()}>
        <Pressable
          onPress={() => {
            // A tap outside shouldn't throw away a transcript you haven't added.
            if (!reviewing) void close();
          }}
          accessibilityLabel="Cancel voice brain dump"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }}>
          <Animated.View
            entering={SlideInDown.duration(DURATION.medium4).easing(EASING.emphasizedDecelerate)}
            onStartShouldSetResponder={() => true}
            style={{ ...panel.style, minHeight: 440 }}>
            {panel.background}
            <View className="items-center" style={{ paddingTop: 16, paddingBottom: 8 }}>
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.gray }} />
            </View>

            <View className="items-center px-6" style={{ gap: 6, paddingTop: 8 }}>
              <Text style={{ fontSize: 22, fontWeight: '600', color: colors.text }}>{title}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text2, textAlign: 'center', maxWidth: 320 }}>
                {subtitle}
              </Text>
            </View>

            {reviewing ? (
              <Animated.View entering={EXPAND_IN} style={{ paddingHorizontal: 20, paddingTop: 20, gap: 12 }}>
                <View
                  style={{
                    borderRadius: 24,
                    borderCurve: 'continuous',
                    backgroundColor: colors.bg3,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    maxHeight: 280,
                  }}>
                  <TextInput
                    value={refined}
                    onChangeText={setRefined}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    accessibilityLabel="Your thoughts, one per line"
                    className="text-sf-text"
                    style={{ fontSize: 17, lineHeight: 25, minHeight: 96 }}
                  />
                </View>
                {transcript && transcript !== refined ? (
                  <View style={{ gap: 8 }}>
                    <Pressable
                      onPress={() => {
                        haptics.selection();
                        setShowTranscript((open) => !open);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showTranscript }}
                      hitSlop={8}
                      className="flex-row items-center"
                      style={{ gap: 4, alignSelf: 'flex-start', paddingHorizontal: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>What you said</Text>
                      <TurningChevron expanded={showTranscript} color={colors.accent} />
                    </Pressable>
                    {showTranscript ? (
                      <Animated.View entering={EXPAND_IN} exiting={COLLAPSE_OUT}>
                        <Text
                          selectable
                          style={{ fontSize: 14, lineHeight: 20, color: colors.text2, paddingHorizontal: 4 }}>
                          {transcript}
                        </Text>
                      </Animated.View>
                    ) : null}
                  </View>
                ) : null}
              </Animated.View>
            ) : (
              <>
                <View className="items-center justify-center" style={{ height: 200 }}>
                  <MicPulse
                    level={recording ? meterToLevel(status.metering) : 0}
                    active={recording}
                    label={recording ? 'Stop and clean up' : 'Start talking'}
                    onPress={() => {
                      if (recording) void finish();
                      else if (phase === 'error') void start();
                    }}
                  />
                </View>
                <Text
                  style={{
                    textAlign: 'center',
                    fontSize: 16,
                    fontWeight: '600',
                    color: recording && remaining <= 30 ? colors.danger : colors.text2,
                    fontVariant: ['tabular-nums'],
                  }}>
                  {recording
                    ? remaining <= 30
                      ? `${formatRecordingClock(seconds)} · ${remaining}s left`
                      : formatRecordingClock(seconds)
                    : ' '}
                </Text>
              </>
            )}

            <View className="flex-row items-center px-6" style={{ gap: 12, paddingTop: 20 }}>
              <SheetButton
                label={reviewing ? 'Discard' : 'Cancel'}
                tone="tonal"
                onPress={() => void close()}
              />
              {reviewing ? (
                <SheetButton icon="text-box-plus-outline" label="Add to today" disabled={!refined.trim()} onPress={add} />
              ) : phase === 'error' ? (
                <SheetButton
                  icon={
                    errorKind === 'permission'
                      ? 'cog-outline'
                      : errorKind === 'ai-setup'
                        ? 'star-four-points-outline'
                        : errorKind === 'network'
                          ? 'wifi-refresh'
                          : 'microphone'
                  }
                  label={errorKind === 'permission' ? 'Open settings' : errorKind === 'ai-setup' ? 'AI settings' : 'Try again'}
                  onPress={() => {
                    if (errorKind === 'permission') void Linking.openSettings();
                    else if (errorKind === 'ai-setup') void close().then(() => router.push('/settings/ai'));
                    else void start();
                  }}
                />
              ) : (
                <SheetButton icon="creation" label="Done" disabled={!recording} onPress={() => void finish()} />
              )}
            </View>

            <ProgressOverlay visible={phase === 'working'} state="working" label="Cleaning up what you said…" />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** M3 Expressive medium button: 52dp, fully round, squaring off while held. */
function SheetButton({
  label,
  icon,
  tone = 'filled',
  disabled,
  onPress,
}: {
  label: string;
  icon?: IconName;
  tone?: 'filled' | 'tonal';
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const filled = tone === 'filled';
  const ink = filled ? colors.onAccent : colors.text;
  return (
    <ElasticPressable
      variant="control"
      radius={26}
      glow={filled ? 'rgba(255,255,255,0.22)' : undefined}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      containerStyle={{ flex: 1 }}
      style={({ pressed }) => ({
        height: 52,
        borderRadius: pressed ? 14 : 26,
        overflow: 'hidden',
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? colors.accent : colors.bg3,
        opacity: disabled ? 0.45 : 1,
      })}>
      {icon ? <MaterialCommunityIcons name={icon} size={20} color={ink} /> : null}
      <Text style={{ fontSize: 16, fontWeight: '600', color: ink }}>{label}</Text>
    </ElasticPressable>
  );
}
