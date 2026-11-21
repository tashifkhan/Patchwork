import { type ReactNode } from 'react';
import {
  Platform,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  type SharedValue,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { EXPRESSIVE } from '@/lib/motion';
import { withAlpha } from '@/lib/theme';

/*
 * The press response here is adapted from `luminousElasticClickable` in
 * Expressive Clock (https://github.com/samuelbeckman/expressive-clock,
 * ui/Glass.kt), MIT License, Copyright (c) 2026 Rayane Bouafia. See
 * THIRD-PARTY-NOTICES.md at the repo root.
 */

const REDUCE = { reduceMotion: ReduceMotion.System } as const;
/** Finger travel, in points, after which a press counts as a scroll and lets go. */
const DRAG_SLOP = 10;

export interface ElasticPressOptions {
  /** How far the control grows toward the finger, as a fraction of its size. */
  maxStretch?: number;
  /** How far it shifts toward the finger, in points. */
  maxTranslate?: number;
  /** Scale while held. */
  pressedScale?: number;
  /** Let go once the finger starts dragging, for controls inside a scroll view. */
  releaseOnDrag?: boolean;
}

export interface ElasticPress {
  /** Spread onto the view that should move. They only watch touches, so presses inside still fire. */
  handlers: {
    onLayout: (event: LayoutChangeEvent) => void;
    onTouchStart: (event: GestureResponderEvent) => void;
    onTouchMove: (event: GestureResponderEvent) => void;
    onTouchEnd: () => void;
    onTouchCancel: () => void;
  };
  /** Animated style for that same view. */
  style: ReturnType<typeof useAnimatedStyle>;
  /** Finger position in the view's own points, for [PressGlow]. */
  touchX: SharedValue<number>;
  touchY: SharedValue<number>;
  /** 1 while held, easing back to 0 after release. */
  glow: SharedValue<number>;
  /**
   * Lets go. The touch handlers call it, but a touch end can get lost (a
   * layout animation moving the view mid-press), so also wire it to the inner
   * Pressable's onPressOut. Safe to call twice.
   */
  release: () => void;
}

/**
 * Makes a control give under a finger. It shrinks a little, stretches and
 * shifts toward the touch, then springs back with a small overshoot.
 */
export function useElasticPress({
  maxStretch = 0.06,
  maxTranslate = 1.8,
  pressedScale = 0.95,
  releaseOnDrag = false,
}: ElasticPressOptions = {}): ElasticPress {
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  // Finger offset from the centre, -1 to 1 on each axis.
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const held = useSharedValue(false);

  function follow(x: number, y: number) {
    touchX.set(x);
    touchY.set(y);
    const cx = width.get() / 2;
    const cy = height.get() / 2;
    if (cx <= 0 || cy <= 0) return;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    dx.set(withSpring(clamp((x - cx) / cx), { ...EXPRESSIVE.pressHold, ...REDUCE }));
    dy.set(withSpring(clamp((y - cy) / cy), { ...EXPRESSIVE.pressHold, ...REDUCE }));
  }

  function release() {
    if (!held.get()) return;
    held.set(false);
    dx.set(withSpring(0, { ...EXPRESSIVE.pressRelease, ...REDUCE }));
    dy.set(withSpring(0, { ...EXPRESSIVE.pressRelease, ...REDUCE }));
    scale.set(withSpring(1, { ...EXPRESSIVE.scaleRelease, ...REDUCE }));
    glow.set(withTiming(0, { duration: 260 }));
  }

  const handlers: ElasticPress['handlers'] = {
    onLayout: (event) => {
      width.set(event.nativeEvent.layout.width);
      height.set(event.nativeEvent.layout.height);
    },
    onTouchStart: (event) => {
      const { locationX, locationY, pageX, pageY } = event.nativeEvent;
      held.set(true);
      startX.set(pageX);
      startY.set(pageY);
      scale.set(withTiming(pressedScale, { duration: 90, ...REDUCE }));
      glow.set(withTiming(1, { duration: 120 }));
      follow(locationX, locationY);
    },
    onTouchMove: (event) => {
      if (!held.get()) return;
      const { locationX, locationY, pageX, pageY } = event.nativeEvent;
      if (
        releaseOnDrag &&
        Math.hypot(pageX - startX.get(), pageY - startY.get()) > DRAG_SLOP
      ) {
        release();
        return;
      }
      follow(locationX, locationY);
    },
    onTouchEnd: release,
    onTouchCancel: release,
  };

  const style = useAnimatedStyle(() => {
    // Stretching one way thins the other a little, like something soft.
    const stretchX = 1 + maxStretch * Math.abs(dx.value) - 0.03 * Math.abs(dy.value);
    const stretchY = 1 + maxStretch * 1.06 * Math.abs(dy.value) - 0.03 * Math.abs(dx.value);
    return {
      transform: [
        { translateX: dx.value * maxTranslate },
        { translateY: dy.value * maxTranslate },
        { scaleX: scale.value * stretchX },
        { scaleY: scale.value * stretchY },
      ],
    };
  });

  return { handlers, style, touchX, touchY, glow, release };
}

/**
 * A soft light that follows the finger tracked by [press]. Put it inside the
 * control, as the first child of something that clips to the control's shape.
 */
export function PressGlow({
  press,
  color,
  radius,
  size = 44,
}: {
  press: ElasticPress;
  /** Glow colour, with its alpha included. */
  color: string;
  /** Corner radius of the control, so the light stays inside it. */
  radius: number;
  /** Spread of the light, in points. */
  size?: number;
}) {
  const dot = useAnimatedStyle(() => ({
    opacity: press.glow.value,
    transform: [{ translateX: press.touchX.value }, { translateY: press.touchY.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: radius,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}>
      {/* A point with a wide blurred shadow reads as a light, with no gradient needed. */}
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, width: 1, height: 1 },
          { boxShadow: `0 0 ${size}px ${Math.round(size * 0.7)}px ${color}` },
          dot,
        ]}
      />
    </Animated.View>
  );
}

/**
 * A view that gives under a finger. On Android it also lights up where the
 * finger is (Paisa's pressGlow), clipped to `glowRadius`; pass `glow={false}` to skip it.
 */
export function ElasticView({
  children,
  style,
  glow = Platform.OS === 'android',
  glowRadius = 16,
  ...options
}: ElasticPressOptions & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: boolean;
  glowRadius?: number;
}) {
  const press = useElasticPress(options);
  const { colors } = useTheme();
  return (
    <Animated.View {...press.handlers} style={[style, press.style]}>
      {children}
      {glow ? <PressGlow press={press} color={withAlpha(colors.accent, 0.12)} radius={glowRadius} /> : null}
    </Animated.View>
  );
}
