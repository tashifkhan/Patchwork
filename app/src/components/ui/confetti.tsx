import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { useCelebrationStore } from '@/lib/feedback';

const PIECES = 48;
const DURATION_MS = 2200;

/**
 * Full-screen confetti that never takes touches. Mounted once at the root;
 * each `celebrate()` call drops a new burst. Skipped when the system asks for
 * reduced motion.
 */
export function ConfettiHost() {
  const burst = useCelebrationStore((s) => s.burst);
  const settled = useCelebrationStore((s) => s.settled);
  const reduced = useReducedMotion();
  const showing = burst > settled && !reduced;

  useEffect(() => {
    if (burst <= settled) return;
    const timer = setTimeout(() => useCelebrationStore.setState({ settled: burst }), DURATION_MS + 400);
    return () => clearTimeout(timer);
  }, [burst, settled]);

  if (!showing) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Burst key={burst} seed={burst} />
    </View>
  );
}

/** Repeatable 0–1 noise, so a burst's layout is fixed by its seed (render stays pure). */
function noise(seed: number, index: number, channel: number) {
  const x = Math.sin(seed * 12.9898 + index * 78.233 + channel * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

function Burst({ seed }: { seed: number }) {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(() => {
    const palette = [colors.accent, colors.green, colors.orange, colors.yellow, colors.purple, colors.red];
    return Array.from({ length: PIECES }, (_, index) => ({
      x: noise(seed, index, 1) * width,
      drift: (noise(seed, index, 2) - 0.5) * 160,
      delay: noise(seed, index, 3) * 350,
      spin: (noise(seed, index, 4) - 0.5) * 900,
      size: 6 + noise(seed, index, 5) * 6,
      round: index % 3 === 0,
      color: palette[index % palette.length],
    }));
  }, [colors, seed, width]);
  return (
    <>
      {pieces.map((piece, index) => (
        <Piece key={index} {...piece} fall={height + 40} />
      ))}
    </>
  );
}

function Piece({
  x,
  drift,
  delay,
  spin,
  size,
  round,
  color,
  fall,
}: {
  x: number;
  drift: number;
  delay: number;
  spin: number;
  size: number;
  round: boolean;
  color: string;
  fall: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withDelay(
        delay,
        withTiming(1, { duration: DURATION_MS - delay, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System })
      )
    );
  }, [delay, progress]);
  const style = useAnimatedStyle(() => {
    const t = progress.get();
    return {
      opacity: t < 0.85 ? 1 : (1 - t) / 0.15,
      transform: [
        { translateX: x + drift * t },
        { translateY: -30 + fall * t },
        { rotate: `${spin * t}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: round ? size : size * 0.45,
          borderRadius: round ? size / 2 : 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}
