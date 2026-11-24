import { BlurTargetView, BlurView } from 'expo-blur';
import { createContext, type ReactNode, type RefObject, useContext } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { withAlpha } from '@/lib/theme';

/** Android blurs with RenderNode from 12 on; before that a frosted bar would only be a slow copy. */
export const CAN_FROST = Platform.OS === 'ios' || (Platform.OS === 'android' && Number(Platform.Version) >= 31);

/**
 * The view frosted chrome blurs on Android. expo-blur can only blur the
 * contents of a `BlurTargetView`, so a screen (or the tab navigator) wraps its
 * content in a `FrostTarget` and the bars floating over it read the ref from
 * here. iOS blurs whatever is behind and ignores it.
 */
const FrostTargetContext = createContext<RefObject<View | null> | null>(null);

export function FrostTargetProvider({ target, children }: { target: RefObject<View | null>; children: ReactNode }) {
  return <FrostTargetContext.Provider value={target}>{children}</FrostTargetContext.Provider>;
}

export function useFrostTarget() {
  return useContext(FrostTargetContext);
}

/** What frosted chrome blurs: on Android the content has to sit inside this. */
export function FrostTarget({
  target,
  style,
  children,
}: {
  target: RefObject<View | null>;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  if (Platform.OS !== 'android') return <View style={style}>{children}</View>;
  return (
    <BlurTargetView ref={target} style={style}>
      {children}
    </BlurTargetView>
  );
}

/**
 * Frosted glass that fills its parent: put it first inside a bar, a pill or a
 * circle that clips to its own shape. The content behind is blurred and washed
 * with a little of `tint` (the theme background by default), so text on top
 * stays readable. Where blur isn't available it becomes a nearly solid fill.
 */
export function Frost({
  tint,
  strength = 0.55,
  intensity = 60,
  target: targetProp,
}: {
  /** Wash over the blur. */
  tint?: string;
  /** How much of the wash covers the blur, 0 to 1. */
  strength?: number;
  intensity?: number;
  /** Overrides the target from context. */
  target?: RefObject<View | null> | null;
}) {
  const { colors, scheme } = useTheme();
  const contextTarget = useFrostTarget();
  const target = targetProp ?? contextTarget;
  const wash = tint ?? colors.bg;
  const blurred = CAN_FROST && (Platform.OS === 'ios' || target != null);

  if (!blurred) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(wash, 0.94) }]} />;
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={intensity}
        tint={Platform.OS === 'ios' ? 'systemChromeMaterial' : scheme === 'dark' ? 'dark' : 'light'}
        {...(Platform.OS === 'android' && target
          ? { blurTarget: target, blurMethod: 'dimezisBlurViewSdk31Plus' as const }
          : null)}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(wash, strength) }]} />
    </View>
  );
}
