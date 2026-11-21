import { type ReactNode, useId, useState } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/components/theme/context';
import { withAlpha } from '@/lib/theme';
import { View } from '@/tw';

/*
 * Expressive Clock's surfaces and type, ported from its Compose sources
 * (https://github.com/samuelbeckman/expressive-clock, MIT): `Modifier.glass`
 * (ui/Glass.kt), `Modifier.clockLighting` (ui/screens/WorldCitySurface.kt),
 * and the Google Sans Flex cuts it pins in ui/theme/ClockFace.kt and Type.kt.
 * The fonts are static instances of Google Sans Flex (OFL 1.1) at those axis
 * values, renamed "Patchwork Clock"; see assets/fonts/OFL.txt.
 */

const ANDROID = Platform.OS === 'android';

/** Font families registered by the expo-font plugin (file names). Android only; iOS uses the system face. */
export const CLOCK_FONT = {
  /** Stopwatch readout: opsz 34, wght 500, fully rounded. */
  stopwatch: ANDROID ? 'PatchworkClock-Stopwatch' : undefined,
  /** Running countdown: opsz 36, wght 750, fully rounded. */
  timerRun: ANDROID ? 'PatchworkClock-TimerRun' : undefined,
  /** Countdown at rest: opsz 36, wght 550. */
  timerIdle: ANDROID ? 'PatchworkClock-TimerIdle' : undefined,
  /** titleMediumEmphasized / labelLargeEmphasized: pill and preset labels. */
  title: ANDROID ? 'PatchworkClock-Title' : undefined,
  /** labelSmall: the caption under a readout. */
  label: ANDROID ? 'PatchworkClock-Label' : undefined,
  /** bodyMedium. */
  body: ANDROID ? 'PatchworkClock-Body' : undefined,
} as const;

/** Cap height to font size for these cuts: a digit's ink is 0.728 em (ClockFace.DIGIT_EM). */
export function fontSizeForCap(capHeight: number) {
  return capHeight / 0.728;
}

/**
 * `Modifier.glass`: a translucent tint running diagonally from 96% to 82%,
 * a bright 1.25dp edge (white at 82–86% on light, 14% on dark) and a soft
 * shadow tinted with the accent. Children sit on top.
 */
export function Glass({
  tint,
  radius,
  borderAlpha = 0.82,
  shadow = 14,
  style,
  children,
}: {
  tint: string;
  radius: number;
  borderAlpha?: number;
  /** Shadow elevation in dp; 0 for none. */
  shadow?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const id = useId().replace(/:/g, '');
  // Measured, not "100%": a percentage SVG resolves before layout and stops short of the edge.
  const [box, setBox] = useState({ width: 0, height: 0 });
  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        if (width !== box.width || height !== box.height) setBox({ width, height });
      }}
      style={[
        {
          borderRadius: radius,
          borderCurve: 'continuous',
          borderWidth: 1.25,
          borderColor: dark ? 'rgba(255,255,255,0.14)' : `rgba(255,255,255,${borderAlpha})`,
          boxShadow:
            shadow > 0
              ? dark
                ? `0 ${shadow / 2}px ${shadow}px rgba(0,0,0,0.6)`
                : `0 ${shadow / 2}px ${shadow * 1.4}px ${withAlpha(colors.accent, 0.2)}`
              : undefined,
          overflow: 'hidden',
        },
        style,
      ]}>
      <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={box.width} height={box.height}>
        <Defs>
          <LinearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={dark ? 0.94 : 0.96} />
            <Stop offset="0.5" stopColor={tint} stopOpacity={0.88} />
            <Stop offset="1" stopColor={tint} stopOpacity={dark ? 0.84 : 0.82} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={box.width} height={box.height} fill={`url(#g${id})`} />
      </Svg>
      {children}
    </View>
  );
}

/**
 * `Modifier.clockLighting`: the light around a round face. A soft accent
 * ambient and a faint shadow pooled just below centre, and a thin bright
 * halo at the rim. Drawn in a box larger than the face so nothing clips.
 */
export function ClockLighting({ size }: { size: number }) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const id = useId().replace(/:/g, '');
  const box = size * 1.4;
  const c = box / 2;
  const r = size / 2 - 4;
  const below = c + r * 0.15;
  return (
    <Svg
      width={box}
      height={box}
      pointerEvents="none"
      style={{ position: 'absolute', left: (size - box) / 2, top: (size - box) / 2 }}>
      <Defs>
        <RadialGradient id={`s${id}`} cx={c} cy={below + r * 0.03} r={r * 1.23} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#000" stopOpacity={0} />
          <Stop offset="0.62" stopColor="#000" stopOpacity={dark ? 0.025 : 0.035} />
          <Stop offset="0.84" stopColor="#000" stopOpacity={dark ? 0.008 : 0.012} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`a${id}`} cx={c} cy={below} r={r * 1.3} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0} />
          <Stop offset="0.6" stopColor={colors.accent} stopOpacity={dark ? 0.035 : 0.11} />
          <Stop offset="0.82" stopColor={colors.accent} stopOpacity={dark ? 0.018 : 0.045} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`h${id}`} cx={c} cy={c} r={r * 1.07} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#fff" stopOpacity={0} />
          <Stop offset="0.85" stopColor="#fff" stopOpacity={0} />
          <Stop offset="0.94" stopColor="#fff" stopOpacity={dark ? 0.025 : 0.3} />
          <Stop offset="1" stopColor="#fff" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={below + r * 0.03} r={r * 1.23} fill={`url(#s${id})`} />
      <Circle cx={c} cy={below} r={r * 1.3} fill={`url(#a${id})`} />
      <Circle cx={c} cy={c} r={r * 1.07} fill={`url(#h${id})`} />
    </Svg>
  );
}
