import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useEffectiveScheme } from '@/components/theme/shell';
import { DURATION, EASING, spring, timing } from '@/lib/motion';

/**
 * Colors mirroring the `expo-splash-screen` plugin config in `app.json`. The
 * overlay has to paint the exact same frame the native splash is showing, so
 * these two must be changed together.
 */
export const SPLASH_BACKGROUND = { light: '#FAF1E6', dark: '#1C161F' } as const;

/**
 * Matches `imageWidth` in the plugin config, which is the on-screen size of the
 * mark on both platforms — iOS lays the storyboard image out at `imageWidth`
 * points, and Android composites the source at `imageWidth` dp inside the 288dp
 * splash icon box. Changing one without the other makes the mark visibly jump
 * as the native splash hands over to this overlay.
 *
 * The safe-zone padding baked into the asset is what keeps 180 legal on Android
 * — see `scripts/generate-splash-assets.mjs`.
 */
const ICON_SIZE = 180;

/** Must match `SplashScreen.setOptions({ duration })` in the root layout. */
const NATIVE_FADE = DURATION.medium1;

/** When the exit animation starts, relative to `ready`. */
const EXIT_DELAY = NATIVE_FADE + DURATION.medium2;

/**
 * Hard stop for the overlay.
 *
 * `done` is normally set by the fade's completion callback, but a callback that
 * never arrives (an interrupted animation, a worklet that fails to schedule
 * back onto the JS thread) would leave a fully opaque view pinned over the app
 * with no way to dismiss it. Tear down on a timer regardless.
 */
const EXIT_TIMEOUT = EXIT_DELAY + DURATION.medium4 + DURATION.long2;

const LIGHT_ICON = require('@/assets/images/splash-icon.png');
const DARK_ICON = require('@/assets/images/splash-icon-dark.png');

/**
 * In-app continuation of the native splash screen.
 *
 * The native splash is hidden the moment persisted settings have hydrated,
 * which would otherwise cut straight to a half-populated first screen. This
 * overlay renders the same frame (same background, same mark at the same size)
 * so the handoff is invisible, then plays a short exit once `ready` flips — the
 * mark settles, the overlay lifts away, and the app is revealed.
 *
 * The one frame that cannot match is a theme override: the native splash keys
 * off the system appearance, while this keys off the user's `themeMode`. When
 * those disagree the 250ms native cross-fade covers the change, which is why
 * `SplashScreen.setOptions({ fade: true })` is not optional.
 */
export function AnimatedSplash({ ready }: { ready: boolean }) {
  const scheme = useEffectiveScheme();
  const [done, setDone] = useState(false);
  const progress = useSharedValue(0);
  const iconScale = useSharedValue(1);

  useEffect(() => {
    if (!ready || done) return;
    // Let the native splash finish cross-fading into this overlay before the
    // mark moves, otherwise the pop plays underneath a view that is still there.
    iconScale.value = withDelay(
      NATIVE_FADE,
      withSequence(timing(1.08, DURATION.medium1), spring(1, 'spatial'))
    );
    progress.value = withDelay(
      EXIT_DELAY,
      withTiming(
        1,
        {
          duration: DURATION.medium4,
          easing: EASING.emphasizedAccelerate,
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          'worklet';
          if (finished) scheduleOnRN(setDone, true);
        }
      )
    );

    const fallback = setTimeout(() => setDone(true), EXIT_TIMEOUT);
    return () => clearTimeout(fallback);
  }, [ready, done, iconScale, progress]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.06]) }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  if (done) return null;

  return (
    <Animated.View
      // Stays interactive for the whole of its life rather than opening up the
      // moment `ready` flips: the overlay is still fully opaque through the
      // hand-off and the hold before the fade, and taps landing on UI the user
      // cannot see would be attributed to whatever is underneath.
      pointerEvents="auto"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.overlay,
        { backgroundColor: SPLASH_BACKGROUND[scheme] },
        overlayStyle,
      ]}>
      <Animated.View style={iconStyle}>
        <Image
          style={styles.icon}
          contentFit="contain"
          source={scheme === 'dark' ? DARK_ICON : LIGHT_ICON}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
});
