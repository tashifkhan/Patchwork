import {
  Host,
  LinearWavyProgressIndicator,
  LoadingIndicator,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, size } from '@expo/ui/jetpack-compose/modifiers';
import { useEffect, useRef, useState } from 'react';
import { type HostInstance, type StyleProp, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { DURATION, EASING, spring } from '@/lib/motion';
import { Text, View } from '@/tw';

import type { LoadingBarProps, LoadingStateProps } from './loading';

/**
 * Material 3 Expressive loading state.
 *
 * The bare morphing `LoadingIndicator`: just the shapes, in the accent
 * colour, with no circle behind them.
 *
 * Every Compose `Host` here has an explicit RN size and a matching Compose
 * `size`/`fillMaxWidth` modifier. With `matchContents` the host shrinks to
 * Compose's intrinsic size (240dp for the wavy bar) and ignores the RN width.
 */
export function LoadingState({
  message = 'Loading…',
  subtitle,
  fullScreen = true,
  showBar,
  style,
}: LoadingStateProps) {
  const { colors } = useTheme();
  // One loader at a time: the spinner already says "working", so the
  // linear track is opt-in rather than stacked under every full-screen state.
  const bar = showBar ?? false;
  const indicator = fullScreen ? 72 : 60;

  // Small spring "pop" on mount so the indicator arrives instead of blinking in.
  const scale = useSharedValue(0.6);
  useEffect(() => {
    scale.value = spring(1, 'spatial');
  }, [scale]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // A full-screen state sits under a header and over the tab bar, so the
  // middle of its box is lower than the middle of the screen. Shift the
  // content so it lands on the screen's centre instead.
  const box = useRef<HostInstance>(null);
  const { height: windowHeight } = useWindowDimensions();
  const [shift, setShift] = useState(0);
  function centreOnScreen() {
    if (!fullScreen) return;
    box.current?.measureInWindow((_x, y, _w, h) => {
      if (!h) return;
      const offset = windowHeight / 2 - (y + h / 2);
      // Never push the content out of its own box.
      const limit = h / 4;
      setShift(Math.max(-limit, Math.min(limit, Math.round(offset))));
    });
  }

  return (
    <Animated.View
      ref={box}
      onLayout={centreOnScreen}
      entering={FadeIn.duration(DURATION.medium2).easing(EASING.emphasizedDecelerate)}
      style={[
        {
          flex: fullScreen ? 1 : undefined,
          flexGrow: 1,
          width: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
          paddingVertical: fullScreen ? 0 : 48,
          backgroundColor: fullScreen ? colors.bg : 'transparent',
        },
        style,
      ]}>
      <View style={{ alignItems: 'center', gap: 20, width: '100%', transform: [{ translateY: shift }] }}>
        <Animated.View style={popStyle}>
          <Host style={{ width: indicator, height: indicator }}>
            <LoadingIndicator color={colors.accent} modifiers={[size(indicator, indicator)]} />
          </Host>
        </Animated.View>

        <View className="items-center gap-1.5" style={{ maxWidth: 280 }}>
          {message ? (
            <Text
              className="text-sf-text text-center"
              style={{ fontSize: fullScreen ? 20 : 17, fontWeight: '700', letterSpacing: -0.2 }}>
              {message}
            </Text>
          ) : null}
          {subtitle ? (
            <Text className="text-sf-text-2 text-center text-sm" style={{ lineHeight: 20 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {bar ? <LoadingBar style={{ width: '64%', maxWidth: 240 }} /> : null}
      </View>
    </Animated.View>
  );
}

/** M3 `LinearWavyProgressIndicator`, stretched to the width RN gives it. */
export function LoadingBar({ progress, color, trackColor, style }: LoadingBarProps) {
  const { colors } = useTheme();
  return (
    <View style={[{ width: '100%', height: 16 }, style as StyleProp<ViewStyle>]}>
      <Host style={{ width: '100%', height: 16 }}>
        <LinearWavyProgressIndicator
          progress={progress ?? null}
          color={color ?? colors.accent}
          trackColor={trackColor ?? colors.primaryContainer}
          modifiers={[fillMaxWidth()]}
        />
      </Host>
    </View>
  );
}

/** Compact M3 morphing `LoadingIndicator` for buttons and list footers. */
export function LoadingSpinner({ size: px = 24 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Host style={{ width: px, height: px }}>
      <LoadingIndicator color={colors.accent} modifiers={[size(px, px)]} />
    </Host>
  );
}
