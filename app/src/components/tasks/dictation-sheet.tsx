import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable } from 'react-native';
import Animated, {
  FadeIn,
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { dictateTasks, dictationBlocker } from '@/api/ai';
import { ApiError } from '@/api/client';
import type { TaskList } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { sheetOverlayStyle, useSheetPanel } from '@/components/ui/sheet-panel';
import { ProgressOverlay } from '@/components/ui/progress-overlay';
import {
  OFFLINE_DICTATION_MESSAGE,
  SLOW_DICTATION_MESSAGE,
  checkConnection,
  isNetworkError,
} from '@/lib/connectivity';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { Text, View } from '@/tw';

/**
 * Loudest level (dBFS) a recording must reach to count as speech. Room noise
 * sits well below this; a silent mic reads about -90. Models invent to-dos
 * from silence, so quiet recordings never leave the phone.
 */
const SPEECH_DB = -42;

/** Long enough for a rambling list, short enough to stay under inline upload limits. */
const MAX_SECONDS = 5 * 60;

/**
 * Small mono speech files in formats the audio models accept: AAC (ADTS) on
 * Android, 16-bit WAV on iOS. 16 kHz mono is what speech models resample to anyway.
 */
const RECORDING: RecordingOptions = {
  extension: Platform.OS === 'ios' ? '.wav' : '.aac',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
  isMeteringEnabled: true,
  android: { extension: '.aac', outputFormat: 'aac_adts', audioEncoder: 'aac', sampleRate: 16000 },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MEDIUM,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm' },
};
const MIME_TYPE = Platform.OS === 'ios' ? 'audio/wav' : 'audio/aac';

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
  const { colors } = useTheme();
  const panel = useSheetPanel(16);
  const recorder = useAudioRecorder(RECORDING);
  const status = useAudioRecorderState(recorder, 80);
  const setStaged = useAiStagingStore((s) => s.setStaged);
  const [phase, setPhase] = useState<Phase>('starting');
  const [message, setMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>('retry');
  const [doneLabel, setDoneLabel] = useState('');
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
      await recorder.prepareToRecordAsync();
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

  async function close() {
    cancelled.current = true;
    await release();
    setPhase('starting');
    onClose();
  }

  async function finish() {
    if (phase !== 'recording') return;
    const seconds = recorder.getStatus().durationMillis / 1000;
    await release();
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
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setTimeout(() => void finishRef.current(), MAX_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [phase]);

  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const recording = phase === 'recording';

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
          onPress={() => void close()}
          accessibilityLabel="Cancel dictation"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }}>
          <Animated.View
            entering={SlideInDown.duration(DURATION.medium4).easing(EASING.emphasizedDecelerate)}
            onStartShouldSetResponder={() => true}
            style={{
              ...panel.style,
              minHeight: 420,
            }}>
            {panel.background}
            <View className="items-center" style={{ paddingTop: 16, paddingBottom: 8 }}>
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.gray }} />
            </View>

            <View className="items-center px-6" style={{ gap: 6, paddingTop: 8 }}>
              <Text style={{ fontSize: 22, fontWeight: '600', color: colors.text }}>
                {recording
                  ? 'Listening…'
                  : phase === 'error'
                    ? errorKind === 'network' || errorKind === 'ai-setup'
                      ? 'Dictation unavailable'
                      : 'Dictate a to-do'
                    : 'Getting the mic ready…'}
              </Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text2, textAlign: 'center', maxWidth: 320 }}>
                {phase === 'error' && message
                  ? message
                  : 'Say what you need to do. Try "Call the dentist tomorrow at 10 and buy milk on the way home."'}
              </Text>
            </View>

            <View className="items-center justify-center" style={{ height: 200 }}>
              <MicPulse
                level={recording ? meterToLevel(status.metering) : 0}
                active={recording}
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
              {recording ? (remaining <= 30 ? `${clock} · ${remaining}s left` : clock) : ' '}
            </Text>

            <View className="flex-row items-center px-6" style={{ gap: 12, paddingTop: 20 }}>
              <Pressable
                onPress={() => void close()}
                accessibilityRole="button"
                android_ripple={{ color: colors.separator }}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 52,
                  borderRadius: pressed ? 14 : 26,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.bg3,
                })}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Cancel</Text>
              </Pressable>
              {phase === 'error' ? (
                <Pressable
                  onPress={() => {
                    if (errorKind === 'permission') void Linking.openSettings();
                    else if (errorKind === 'ai-setup') {
                      void close().then(() => router.push('/settings/ai'));
                    } else void start();
                  }}
                  accessibilityRole="button"
                  android_ripple={{ color: colors.separator }}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 52,
                    borderRadius: pressed ? 14 : 26,
                    overflow: 'hidden',
                    flexDirection: 'row',
                    gap: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.accent,
                  })}>
                  <MaterialCommunityIcons
                    name={
                      errorKind === 'permission'
                        ? 'cog-outline'
                        : errorKind === 'ai-setup'
                          ? 'star-four-points-outline'
                          : errorKind === 'network'
                            ? 'wifi-refresh'
                            : 'microphone'
                    }
                    size={20}
                    color={colors.onAccent}
                  />
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onAccent }}>
                    {errorKind === 'permission'
                      ? 'Open settings'
                      : errorKind === 'ai-setup'
                        ? 'AI settings'
                        : 'Try again'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void finish()}
                  disabled={!recording}
                  accessibilityRole="button"
                  accessibilityLabel="Done, create to-dos"
                  android_ripple={{ color: colors.separator }}
                  style={({ pressed }) => ({
                    flex: 1,
                    height: 52,
                    borderRadius: pressed ? 14 : 26,
                    overflow: 'hidden',
                    flexDirection: 'row',
                    gap: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.accent,
                    opacity: recording ? 1 : 0.45,
                  })}>
                  <MaterialCommunityIcons name="creation" size={20} color={colors.onAccent} />
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.onAccent }}>Done</Text>
                </Pressable>
              )}
            </View>

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

/** Metering is dBFS (about -60 silent to 0 loud); map to 0..1 for the pulse. */
function meterToLevel(metering?: number) {
  if (metering == null) return 0.15;
  return Math.max(0, Math.min(1, (metering + 55) / 50));
}

/**
 * The big mic. A soft halo breathes while recording and swells with your
 * voice; tapping it while recording is the same as Done.
 */
function MicPulse({ level, active, onPress }: { level: number; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const voice = useSharedValue(0);
  const breath = useSharedValue(0);

  useEffect(() => {
    voice.value = withSpring(level, { damping: 14, stiffness: 180 });
  }, [level, voice]);

  useEffect(() => {
    breath.value = active ? withRepeat(withTiming(1, { duration: 1400 }), -1, true) : withTiming(0);
  }, [active, breath]);

  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.08 + voice.value * 0.45 }],
    opacity: active ? 0.35 + voice.value * 0.3 : 0,
  }));
  const outer = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.04 + voice.value * 0.2 }],
    opacity: active ? 0.5 : 0,
  }));

  return (
    <View style={{ width: 168, height: 168, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', width: 168, height: 168, borderRadius: 84, backgroundColor: colors.primaryContainer },
          halo,
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', width: 128, height: 128, borderRadius: 64, backgroundColor: colors.primaryContainer },
          outer,
        ]}
      />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={active ? 'Stop and create to-dos' : 'Start dictating'}
        style={({ pressed }) => ({
          width: 96,
          height: 96,
          // M3 Expressive: the shape squares off slightly while pressed.
          borderRadius: pressed ? 32 : 48,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? colors.accent : colors.primaryContainer,
        })}>
        <MaterialCommunityIcons
          name={active ? 'microphone' : 'microphone-outline'}
          size={44}
          color={active ? colors.onAccent : colors.onPrimaryContainer}
        />
      </Pressable>
    </View>
  );
}
