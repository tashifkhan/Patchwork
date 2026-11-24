import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ComponentProps, useEffect, useState } from 'react';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { GlassIconButton } from '@/components/ui/glass-button';
import { useLiquidGlass } from '@/components/ui/glass-surface';
import { ElasticPressable, useSpringValue } from '@/components/ui/motion';
import { haptics } from '@/lib/haptics';
import { formatRecordingClock } from '@/lib/voice-recording';
import { Text, View } from '@/tw';

const BARS = 44;
const BAR_MAX = 64;

/**
 * A scrolling level meter, newest bar on the right, like a voice recorder.
 * `tick` changes on every recorder status update, so silence still scrolls.
 */
export function Waveform({ level, tick, active }: { level: number; tick: number; active: boolean }) {
  const { colors } = useTheme();
  const [history, setHistory] = useState<number[]>(() => Array(BARS).fill(0));
  const [lastTick, setLastTick] = useState(tick);

  // Push a bar per recorder update (React's "adjust state on prop change"),
  // so silence still scrolls even when `level` repeats.
  if (active && tick !== lastTick) {
    setLastTick(tick);
    setHistory([...history.slice(1), level]);
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-center justify-center"
      style={{ height: BAR_MAX, gap: 3, alignSelf: 'stretch' }}>
      {history.map((value, index) => {
        // Older bars fade toward the left edge.
        const age = index / (BARS - 1);
        return (
          <View
            key={index}
            style={{
              width: 4,
              height: Math.max(4, Math.round(value * BAR_MAX)),
              borderRadius: 2,
              backgroundColor: active ? colors.accent : colors.gray2,
              opacity: 0.25 + age * 0.75,
            }}
          />
        );
      })}
    </View>
  );
}

/** Big tabular timer with a breathing dot while recording. */
export function RecordingClock({
  seconds,
  remaining,
  state,
}: {
  seconds: number;
  remaining: number;
  state: 'recording' | 'paused' | 'idle';
}) {
  const { colors } = useTheme();
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(
      state === 'recording'
        ? withRepeat(
            withTiming(0.25, {
              duration: 700,
              reduceMotion: ReduceMotion.System,
            }),
            -1,
            true
          )
        : withTiming(state === 'idle' ? 0 : 1, { duration: 150 })
    );
  }, [pulse, state]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const warn = state !== 'idle' && remaining <= 30;

  return (
    <View className="items-center" style={{ gap: 4 }}>
      <View className="flex-row items-center" style={{ gap: 10 }}>
        <Animated.View
          style={[
            {
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: state === 'paused' ? colors.gray : colors.red,
              opacity: state === 'idle' ? 0 : 1,
            },
            dot,
          ]}
        />
        <Text
          accessibilityRole="timer"
          style={{
            fontSize: 44,
            fontWeight: '300',
            letterSpacing: -1,
            color: warn ? colors.danger : colors.text,
            fontVariant: ['tabular-nums'],
          }}>
          {formatRecordingClock(seconds)}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 13,
          color: warn ? colors.danger : colors.text3,
          fontVariant: ['tabular-nums'],
        }}>
        {state === 'paused' ? 'Paused' : warn ? `${remaining}s left` : ' '}
      </Text>
    </View>
  );
}

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Cancel, Done and Pause/Resume for a live recording. iOS 26 gets Liquid
 * Glass circles; Android gets M3 Expressive tonal buttons around a large
 * filled Done that sits as a rounded square while recording and morphs to a
 * circle when paused.
 */
export function RecorderControls({
  ready,
  paused,
  onCancel,
  onDone,
  onTogglePause,
}: {
  ready: boolean;
  paused: boolean;
  onCancel: () => void;
  onDone: () => void;
  onTogglePause: () => void;
}) {
  const { colors } = useTheme();
  const glass = useLiquidGlass();

  if (glass) {
    return (
      <View className="flex-row items-center justify-center" style={{ gap: 32 }}>
        <GlassIconButton sf="xmark" icon="close" label="Cancel" size={56} onPress={onCancel} />
        <GlassIconButton
          sf="checkmark"
          icon="check"
          label="Done, clean it up"
          size={80}
          tint={ready ? colors.accent : undefined}
          onPress={() => ready && onDone()}
        />
        <GlassIconButton
          sf={paused ? 'mic.fill' : 'pause.fill'}
          icon={paused ? 'microphone' : 'pause'}
          label={paused ? 'Resume' : 'Pause'}
          size={56}
          onPress={() => ready && onTogglePause()}
        />
      </View>
    );
  }

  return (
    <View className="flex-row items-center justify-center" style={{ gap: 28 }}>
      <RoundButton icon="close" label="Cancel" onPress={onCancel} />
      <DoneButton ready={ready} paused={paused} onPress={onDone} />
      <RoundButton
        icon={paused ? 'microphone' : 'pause'}
        label={paused ? 'Resume' : 'Pause'}
        disabled={!ready}
        onPress={onTogglePause}
      />
    </View>
  );
}

function RoundButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <ElasticPressable
      variant="control"
      radius={28}
      disabled={disabled}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: pressed ? 16 : 28,
        backgroundColor: colors.selectionBg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: disabled ? 0.45 : 1,
      })}>
      <MaterialCommunityIcons name={icon} size={24} color={colors.onSelectionBg} />
    </ElasticPressable>
  );
}

function DoneButton({ ready, paused, onPress }: { ready: boolean; paused: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const radius = useSpringValue(paused ? 44 : 28, 'expand');
  const shape = useAnimatedStyle(() => ({ borderRadius: radius.get() }));
  return (
    <ElasticPressable
      variant="control"
      radius={28}
      disabled={!ready}
      onPress={() => {
        haptics.impact('medium');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="Done, clean it up"
      style={{ width: 88, height: 88 }}>
      <Animated.View
        style={[
          {
            width: 88,
            height: 88,
            backgroundColor: ready ? colors.accent : colors.gray3,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          },
          shape,
        ]}>
        <MaterialCommunityIcons name="check" size={36} color={colors.onAccent} />
      </Animated.View>
    </ElasticPressable>
  );
}
