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
import { useKeepAwake } from 'expo-keep-awake';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { dictateTasks, dictationBlocker } from '@/features/ai/generate-tasks';
import { ApiError } from '@/api/error';
import type { TaskList } from '@/api/types';
import { RecorderControls, RecordingClock, Waveform } from '@/components/brain-dump/recorder-ui';
import { useTheme } from '@/components/theme/context';
import { ElasticPressable } from '@/components/ui/motion';
import { sheetOverlayStyle, useSheetPanel } from '@/components/ui/sheet-panel';
import { ProgressOverlay } from '@/components/ui/progress-overlay';
import { GlassPillButton } from '@/components/ui/glass-button';
import { useLiquidGlass } from '@/components/ui/glass-surface';
import {
  OFFLINE_DICTATION_MESSAGE,
  SLOW_DICTATION_MESSAGE,
  checkConnection,
  isNetworkError,
} from '@/features/sync/connectivity';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';
import { MAX_SECONDS, RECORDING, RECORDING_MIME_TYPE, SPEECH_DB, meterToLevel, prepareWithTimeout } from '@/lib/voice-recording';
import { useAiStagingStore } from '@/features/ai/ai-staging-store';
import { Text, View } from '@/tw';

const MIME_TYPE = RECORDING_MIME_TYPE;

type Phase = 'starting' | 'recording' | 'working' | 'done' | 'error';

/** What went wrong decides the recovery button: retry, OS settings, or AI settings. */
type ErrorKind = 'retry' | 'permission' | 'ai-setup' | 'network';

/**
 * Hold-free voice capture for new to-dos. Opening the sheet starts recording;
 * Done sends the note to an audio-capable AI model, which writes the to-dos,
 * and the task preview opens with them staged.
 */
export function DictationSheet({
  visible,
  lists,
  availableTags,
  defaultListId,
  onClose,
  beforeReview,
}: {
  visible: boolean;
  lists: TaskList[];
  availableTags: string[];
  defaultListId?: string;
  onClose: () => void;
  /** Runs right before the preview opens, e.g. to close the add dialog. */
  beforeReview?: () => void;
}) {
  const { colors, scheme } = useTheme();
  const panel = useSheetPanel(16);
  const recorder = useAudioRecorder(RECORDING);
  const status = useAudioRecorderState(recorder, 80);
  const setStaged = useAiStagingStore((s) => s.setStaged);
  const [phase, setPhase] = useState<Phase>('starting');
  const [message, setMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>('retry');
  const [doneLabel, setDoneLabel] = useState('');
  const [paused, setPaused] = useState(false);
  const cancelled = useRef(false);
  // Loudest level heard this take; null when the platform reports no metering.
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
    setPaused(false);
    setPhase('starting');
    // No model in the ladder can hear audio: say so before recording anything.
    const blocker = dictationBlocker();
    if (blocker) {
      haptics.error();
      fail('ai-setup', blocker.message);
      return;
    }
    try {
      // The voice note only goes anywhere over the network, so check it
      // while the permission prompt is up instead of after a long recording.
      const [permission, connection] = await Promise.all([
        requestRecordingPermissionsAsync(),
        checkConnection({ timeoutMs: 5000, slowMs: 2500 }),
      ]);
      if (cancelled.current) return;
      if (!permission.granted) {
        fail(permission.canAskAgain ? 'retry' : 'permission', 'Allow microphone access to dictate a task.');
        return;
      }
      if (connection !== 'online') {
        haptics.error();
        fail('network', connection === 'offline' ? OFFLINE_DICTATION_MESSAGE : SLOW_DICTATION_MESSAGE);
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await prepareWithTimeout(recorder.prepareToRecordAsync());
      if (cancelled.current) return;
      recorder.record();
      haptics.impact('medium');
      setPhase('recording');
    } catch (error) {
      fail('retry', error instanceof Error ? error.message : 'Could not start the microphone.');
    }
  }, [fail, recorder]);

  // Start as soon as the sheet opens. The model check is instant, so a ladder
  // without a voice model shows its error at once instead of a mic spinner.
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

  function togglePause() {
    if (phase !== 'recording') return;
    if (paused) {
      recorder.record();
      haptics.impact('light');
    } else {
      recorder.pause();
      haptics.selection();
    }
    setPaused(!paused);
  }

  async function close() {
    cancelled.current = true;
    setPaused(false);
    await release();
    setPhase('starting');
    onClose();
  }

  async function finish() {
    if (phase !== 'recording') return;
    const seconds = recorder.getStatus().durationMillis / 1000;
    await release();
    setPaused(false);
    const uri = recorder.uri;
    if (!uri || seconds < 0.8) {
      fail('retry', 'That was too short. Tap the mic and say what you need to do.');
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
      const response = await dictateTasks({ uri, mimeType: MIME_TYPE, availableLists: lists, availableTags });
      if (cancelled.current) return;
      if (response.tasks.length === 0) {
        fail('retry', "The AI didn't hear a to-do in that. Try again, starting with what you need to do.");
        return;
      }
      haptics.success();
      setStaged(
        response.tasks.map((task) => ({ ...task, list_id: task.list_id ?? defaultListId, tags: task.tags ?? [] }))
      );
      setDoneLabel(`${response.tasks.length} to-do${response.tasks.length === 1 ? '' : 's'} ready`);
      setPhase('done');
      // Let the check land, then open the preview.
      setTimeout(() => {
        setPhase('starting');
        onClose();
        beforeReview?.();
        router.push('/ai-review');
      }, 750);
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

  // Release the mic if the screen goes away mid-recording.
  useEffect(() => () => void release(), [release]);

  useEffect(() => {
    if (status.isRecording && typeof status.metering === 'number') {
      peakDb.current = Math.max(peakDb.current ?? -160, status.metering);
    }
  }, [status.isRecording, status.metering]);

  const seconds = Math.floor(status.durationMillis / 1000);
  const remaining = MAX_SECONDS - seconds;
  // At the time limit, send what was said rather than cutting it off.
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  // Counted in recorded time, so a pause doesn't eat into the limit.
  useEffect(() => {
    if (phase === 'recording' && seconds >= MAX_SECONDS) void finishRef.current();
  }, [phase, seconds]);

  const recording = phase === 'recording';
  const title = recording
    ? paused
      ? 'Paused'
      : 'Listening…'
    : phase === 'error'
      ? errorKind === 'network' || errorKind === 'ai-setup'
        ? 'Dictation unavailable'
        : 'Dictate a to-do'
      : 'Getting the mic ready…';
  const subtitle =
    phase === 'error' && message
      ? message
      : 'Say what you need to do. Try "Call the dentist tomorrow at 10 and buy milk on the way home."';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => void close()}>
      {/* Keeps the screen from dimming or locking mid-sentence. */}
      {visible ? <KeepAwake /> : null}
      <Animated.View entering={FadeIn.duration(DURATION.short4)} style={sheetOverlayStyle()}>
        <Pressable
          onPress={() => {
            // A tap outside only closes when there's nothing to lose.
            if (phase === 'error') void close();
          }}
          accessibilityLabel="Cancel dictation"
          style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' }}>
          <Animated.View
            entering={SlideInDown.duration(DURATION.medium4).easing(EASING.emphasizedDecelerate)}
            onStartShouldSetResponder={() => true}
            style={{
              ...panel.style,
              minHeight: 440,
              // No scrim behind it, so a shadow keeps the sheet's edge readable.
              boxShadow: `0 -8px 32px ${scheme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.18)'}`,
            }}>
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

            {phase === 'error' ? (
              // An error says what went wrong; a timer and an empty meter under it would just be noise.
              <View style={{ height: 24 }} />
            ) : (
              <View style={{ paddingHorizontal: 24, paddingTop: 28, gap: 24 }}>
                <RecordingClock
                  seconds={seconds}
                  remaining={remaining}
                  state={recording ? (paused ? 'paused' : 'recording') : 'idle'}
                />
                <Waveform
                  level={recording && !paused ? meterToLevel(status.metering) : 0}
                  tick={status.durationMillis}
                  active={recording && !paused}
                />
              </View>
            )}

            {phase === 'error' ? (
              <View className="flex-row items-center px-6" style={{ gap: 12, paddingTop: 20 }}>
                <SheetButton label="Cancel" tone="tonal" onPress={() => void close()} />
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
              </View>
            ) : (
              <View style={{ paddingTop: 32 }}>
                <RecorderControls
                  ready={recording}
                  paused={paused}
                  doneLabel="Done, create to-dos"
                  onCancel={() => void close()}
                  onDone={() => void finish()}
                  onTogglePause={togglePause}
                />
              </View>
            )}

            <ProgressOverlay
              visible={phase === 'working' || phase === 'done'}
              state={phase === 'done' ? 'done' : 'working'}
              label={phase === 'done' ? doneLabel : 'Turning your voice note into to-dos…'}
            />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function KeepAwake() {
  useKeepAwake('voice-dictation');
  return null;
}

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const SF_FOR: Partial<Record<IconName, import('expo-symbols').SFSymbol>> = {
  'cog-outline': 'gearshape',
  'star-four-points-outline': 'sparkles',
  'wifi-refresh': 'wifi',
  microphone: 'mic.fill',
};

/** M3 Expressive medium button: 52dp, fully round, squaring off while held. */
function SheetButton({
  label,
  icon,
  tone = 'filled',
  onPress,
}: {
  label: string;
  icon?: IconName;
  tone?: 'filled' | 'tonal';
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const glass = useLiquidGlass();
  const filled = tone === 'filled';
  const ink = filled ? colors.onAccent : colors.text;
  if (glass) {
    return (
      <GlassPillButton
        label={label}
        sf={icon ? SF_FOR[icon] : undefined}
        prominent={filled}
        height={52}
        style={{ flex: 1 }}
        onPress={onPress}
      />
    );
  }
  return (
    <ElasticPressable
      variant="control"
      radius={26}
      glow={filled ? 'rgba(255,255,255,0.22)' : undefined}
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
      })}>
      {icon ? <MaterialCommunityIcons name={icon} size={20} color={ink} /> : null}
      <Text style={{ fontSize: 16, fontWeight: '600', color: ink }}>{label}</Text>
    </ElasticPressable>
  );
}
