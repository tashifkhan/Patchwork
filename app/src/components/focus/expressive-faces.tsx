import { useEffect, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/components/theme/context';
import { withAlpha } from '@/lib/theme';
import { useElasticPress } from '@/components/ui/elastic';
import { RollingClock } from '@/components/ui/rolling-clock';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

/*
 * The stopwatch and timer faces, after Expressive Clock
 * (https://github.com/samuelbeckman/expressive-clock, MIT; ui/screens/
 * StopwatchScreen.kt and TimersScreen.kt): a round surface face, a 60-mark
 * stopwatch dial with a sweeping hand, and a timer ring that turns into a
 * moving squiggle while it runs. See THIRD-PARTY-NOTICES.md.
 */

const AnimatedPath = Animated.createAnimatedComponent(Path);
const REDUCE = { reduceMotion: ReduceMotion.System } as const;

/** The round face both modes sit on: tonal surface, hairline outline, gives under the finger. */
function Face({
  size,
  onPress,
  label,
  children,
}: {
  size: number;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  // Expressive Clock's face press: a small stretch toward the finger.
  const press = useElasticPress({ maxStretch: 0.04, maxTranslate: 2, pressedScale: 0.97, releaseOnDrag: true });
  return (
    <Animated.View {...press.handlers} style={[{ width: size, height: size, alignSelf: 'center' }, press.style]}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: colors.bg3,
          borderWidth: 1.25,
          borderColor: withAlpha(colors.text, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// ── Stopwatch ─────────────────────────────────────────────────────────

/**
 * 60 marks, every fifth heavier and in the accent; a hand that sweeps once a
 * minute and fades out under the readout; `mm:` in the ink colour and
 * `ss.cc` in the accent. Tapping the face starts and pauses.
 */
export function StopwatchFace({
  size,
  startedAt,
  pausedElapsed,
  running,
  onToggle,
}: {
  size: number;
  /** Epoch ms the run (virtually) started; null when idle or paused. */
  startedAt: number | null;
  /** Ms already tracked, while paused. */
  pausedElapsed: number | null;
  running: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const elapsed = startedAt != null ? now - startedAt : (pausedElapsed ?? 0);

  // The readout shows hundredths, so it ticks fast, but only while running.
  useEffect(() => {
    if (!running || startedAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 41);
    return () => clearInterval(timer);
  }, [running, startedAt]);

  // The hand runs on the UI thread from the same clock, so it never stutters with the JS readout.
  const start = useSharedValue(startedAt ?? 0);
  const paused = useSharedValue(pausedElapsed ?? 0);
  const live = useSharedValue(running && startedAt != null);
  const turn = useSharedValue(0);
  useEffect(() => {
    start.set(startedAt ?? 0);
    paused.set(pausedElapsed ?? 0);
    live.set(running && startedAt != null);
    // Reset: the hand swings back to 12 the short way, with a small overshoot.
    if (startedAt == null && (pausedElapsed ?? 0) === 0) {
      const at = turn.get() % 1;
      if (at > 0.001) turn.set(withSpring(at > 0.5 ? 1 : 0, { damping: 14, stiffness: 160, ...REDUCE }));
    }
  }, [live, paused, pausedElapsed, running, start, startedAt, turn]);

  useFrameCallback(() => {
    if (!live.get()) return;
    turn.set(((Date.now() - start.get()) % 60_000) / 60_000);
  });
  useEffect(() => {
    if (!running && pausedElapsed != null) turn.set((pausedElapsed % 60_000) / 60_000);
  }, [pausedElapsed, running, turn]);

  const handStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }));

  const inner = size - 44;
  const r = inner / 2;
  const ticks = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
        const major = i % 5 === 0;
        const outer = r - (major ? 5 : 2);
        const innerR = r - (major ? 15 : 8);
        return {
          major,
          x1: r + Math.cos(angle) * innerR,
          y1: r + Math.sin(angle) * innerR,
          x2: r + Math.cos(angle) * outer,
          y2: r + Math.sin(angle) * outer,
        };
      }),
    [r]
  );
  const handLength = r - 28;
  const fadeFrom = Math.min(1, 72 / handLength);
  const fadeTo = Math.min(1, 92 / handLength);

  const ms = Math.max(0, elapsed);
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor(ms / 1000) % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  const readout = size * 0.1;

  return (
    <Face size={size} onPress={onToggle} label={running ? 'Pause stopwatch' : 'Start stopwatch'}>
      <Svg width={inner} height={inner} style={{ position: 'absolute' }}>
        {ticks.map((tick, i) => (
          <Line
            key={i}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={tick.major ? colors.accent : colors.text}
            strokeOpacity={tick.major ? 0.65 : 0.16}
            strokeWidth={tick.major ? 2 : 1.2}
            strokeLinecap="round"
          />
        ))}
      </Svg>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: inner, height: inner }, handStyle]}>
        <Svg width={inner} height={inner}>
          <Defs>
            {/* The hand disappears under the readout instead of crossing the digits. */}
            <RadialGradient id="hand" cx={r} cy={r} r={handLength} gradientUnits="userSpaceOnUse">
              <Stop offset={0} stopColor={colors.accent} stopOpacity={0} />
              <Stop offset={fadeFrom} stopColor={colors.accent} stopOpacity={0} />
              <Stop offset={fadeTo} stopColor={colors.accent} stopOpacity={1} />
              <Stop offset={1} stopColor={colors.accent} stopOpacity={1} />
            </RadialGradient>
          </Defs>
          <Line x1={r} y1={r} x2={r} y2={r - handLength} stroke="url(#hand)" strokeWidth={2.5} strokeLinecap="round" />
          <Circle cx={r} cy={r - handLength} r={5} fill={colors.accent} />
        </Svg>
      </Animated.View>
      <View className="items-center">
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <Text style={{ fontSize: readout, fontWeight: '500', color: colors.text, fontVariant: ['tabular-nums'] }}>
            {pad(minutes)}:
          </Text>
          <Text style={{ fontSize: readout, fontWeight: '500', color: colors.accent, fontVariant: ['tabular-nums'] }}>
            {pad(seconds)}.{pad(hundredths)}
          </Text>
        </View>
        <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.5, color: colors.text2, opacity: 0.8 }}>
          {running ? 'RUNNING' : ms > 0 ? 'PAUSED' : 'STOPWATCH'}
        </Text>
      </View>
    </Face>
  );
}

// ── Timer ─────────────────────────────────────────────────────────────

/**
 * Builds the timer ring: a circle that becomes a squiggle (three nearby
 * frequencies, so it reads as organic with no visible seam) as `amplitude`
 * grows, drawn for `sweep` of a full turn.
 */
function squiggle(cx: number, cy: number, radius: number, sweep: number, amplitude: number, phase: number) {
  'worklet';
  const degrees = 360 * Math.max(0, Math.min(1, sweep));
  if (degrees <= 0) return '';
  const steps = Math.max(48, Math.ceil(degrees / 1.25));
  const point = (deg: number) => {
    const angle = ((deg - 90) * Math.PI) / 180;
    const wave =
      amplitude *
      (Math.sin(angle * 16 + phase) + Math.sin(angle * 11 - phase * 0.68) * 0.34 + Math.sin(angle * 23 + phase * 1.3) * 0.13);
    const rr = radius + wave;
    return [cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr];
  };
  // Quadratic curves through the midpoints, as Expressive Clock draws it: smooth, no corners.
  let [px, py] = point(0);
  let d = `M${px.toFixed(2)} ${py.toFixed(2)}`;
  for (let i = 1; i <= steps; i += 1) {
    const [x, y] = point((degrees * i) / steps);
    const mx = (px + x) / 2;
    const my = (py + y) / 2;
    d += ` Q${px.toFixed(2)} ${py.toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)}`;
    if (i === steps) d += ` L${x.toFixed(2)} ${y.toFixed(2)}`;
    px = x;
    py = y;
  }
  return degrees >= 359 ? `${d} Z` : d;
}

/**
 * The timer face: a squiggly progress ring that wobbles while running and
 * eases back to a flat circle when paused, around rolling digits.
 */
export function TimerFace({
  size,
  text,
  caption,
  progress,
  running,
  color,
  onToggle,
}: {
  size: number;
  /** "24:56". */
  text: string;
  /** "FOCUS", "BREAK", "PAUSED", "READY". */
  caption: string;
  /** Fraction of the block still left, 0–1. */
  progress: number;
  running: boolean;
  color: string;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const inner = size - 20;
  const radius = inner / 2 - 14;
  const c = inner / 2;

  const phase = useSharedValue(0);
  const amplitude = useSharedValue(running ? 8 : 0);
  const sweep = useSharedValue(progress);

  useEffect(() => {
    amplitude.set(withSpring(running ? 8 : 0, { damping: 9.5, stiffness: 360, ...REDUCE }));
    if (running) {
      phase.set(phase.get() % (Math.PI * 2));
      phase.set(withRepeat(withTiming(phase.get() + Math.PI * 2, { duration: 5200, easing: Easing.linear, ...REDUCE }), -1));
    } else {
      cancelAnimation(phase);
    }
  }, [amplitude, phase, running]);

  useEffect(() => {
    sweep.set(withTiming(progress, { duration: 450, easing: Easing.out(Easing.cubic), ...REDUCE }));
  }, [progress, sweep]);

  const track = useAnimatedProps(() => ({ d: squiggle(c, c, radius, 1, amplitude.get(), phase.get()) }));
  const active = useAnimatedProps(() => ({ d: squiggle(c, c, radius, sweep.get(), amplitude.get(), phase.get()) }));

  return (
    <Face size={size} onPress={onToggle} label={running ? 'Pause timer' : 'Start timer'}>
      <Svg width={inner} height={inner} style={{ position: 'absolute' }}>
        <AnimatedPath animatedProps={track} stroke={color} strokeOpacity={0.1} strokeWidth={11} strokeLinecap="round" fill="none" />
        <AnimatedPath animatedProps={active} stroke={color} strokeWidth={11} strokeLinecap="round" fill="none" />
      </Svg>
      <View className="items-center" style={{ paddingHorizontal: 40 }}>
        <RollingClock
          text={text}
          countDown
          style={{ fontSize: size * 0.19, fontWeight: '500', color: colors.text, letterSpacing: -1 }}
        />
        <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.8, color: colors.text2, opacity: 0.8 }}>
          {caption}
        </Text>
      </View>
    </Face>
  );
}
