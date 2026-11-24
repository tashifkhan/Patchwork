import {
  useCallback,
  useContext,
  useRef,
  type ComponentProps,
  type ComponentType,
  type Ref,
} from 'react';
import { Platform, useWindowDimensions, View, type View as RNView } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardController,
  useReanimatedKeyboardAnimation,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useCssElement } from 'react-native-css';

import { ThemeContext } from '@/components/theme/context';

export { KeyboardProvider, KeyboardController } from 'react-native-keyboard-controller';
export type { KeyboardAwareScrollViewRef } from 'react-native-keyboard-controller';

/** Room kept between the caret of a focused field and the top of the keyboard. */
export const FIELD_CLEARANCE = 24;

/**
 * `bottomOffset` for screens with the floating `TaskActionBar`: the bar (a
 * toolbar button plus 8 of padding each side; see `floating-toolbar.tsx`)
 * rides 10 above the keyboard, so a focused field must clear it too.
 */
export const ACTION_BAR_CLEARANCE = (Platform.OS === 'android' ? 72 : 64) + 10 + FIELD_CLEARANCE;

// Loosely typed for `useCssElement`, whose generic inference runs too deep on
// the full scroll view props. `KeyboardScrollViewProps` keeps callers typed.
const CssTarget = KeyboardAwareScrollView as unknown as ComponentType<Record<string, unknown>>;

type KeyboardScrollViewProps = ComponentProps<typeof KeyboardAwareScrollView> & {
  ref?: Ref<KeyboardAwareScrollViewRef>;
  className?: string;
  contentContainerClassName?: string;
};

/**
 * The app's scroll container for anything with a text field in it.
 *
 * Expo apps draw edge to edge, so neither platform shrinks the window for the
 * keyboard any more. This scrolls the focused field above the keyboard as the
 * keyboard moves, frame by frame, on both platforms, and adds the keyboard's
 * height to the scrollable area so the last field can always reach the top
 * of it.
 *
 * Don't also set `automaticallyAdjustKeyboardInsets`: iOS would then move the
 * content a second time.
 */
export function KeyboardScrollView({
  bottomOffset = FIELD_CLEARANCE,
  keyboardShouldPersistTaps = 'handled',
  keyboardDismissMode = 'interactive',
  ...props
}: KeyboardScrollViewProps) {
  const { colors } = useContext(ThemeContext);
  // CSS vars don't resolve `bg-sf-bg` reliably, so the theme color goes in
  // `style` instead, same as the `@/tw` wrappers.
  const names = props.className?.split(/\s+/) ?? [];
  const bg = names.includes('bg-sf-bg') ? colors.bg : undefined;
  const nextProps = {
    ...props,
    bottomOffset,
    keyboardShouldPersistTaps,
    keyboardDismissMode,
    className: bg ? names.filter((name) => name !== 'bg-sf-bg').join(' ') : props.className,
    style: bg ? [props.style, { backgroundColor: bg }] : props.style,
  };
  return useCssElement(CssTarget, nextProps, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
  });
}

/** True while the software keyboard is on screen. Read at call time. */
export function isKeyboardVisible() {
  return Platform.OS !== 'web' && KeyboardController.isVisible();
}

/**
 * Keeps an absolutely positioned bar `gap` above the keyboard, following it
 * frame by frame, and `bottom` above the screen's bottom edge otherwise.
 *
 * The keyboard height counts from the bottom of the window. The screen the
 * bar sits in can end higher up (above Android's bottom navigation, for
 * example), so `marker` measures that distance once and the bar subtracts it.
 * Render `marker` as a sibling of the bar, inside the same screen.
 *
 * The keyboard values come from the app-wide `KeyboardProvider`, which tracks
 * the keyboard from launch. A bar that mounts while the keyboard is already
 * rising therefore starts in the right place on its first frame, instead of
 * waiting for the next keyboard event.
 */
export function useKeyboardLift(bottom: number, gap = 10) {
  const { height } = useReanimatedKeyboardAnimation();
  const anchor = useRef<RNView>(null);
  const { height: windowHeight } = useWindowDimensions();
  const belowScreen = useSharedValue(0);

  const measure = useCallback(() => {
    anchor.current?.measureInWindow((_x, y) => {
      belowScreen.set(Math.max(0, windowHeight - y));
    });
  }, [belowScreen, windowHeight]);

  // `height` is negative while the keyboard is up: -0 closed, -kb open.
  const style = useAnimatedStyle(() => {
    const keyboard = -height.value;
    const lift = keyboard > 0 ? Math.max(0, keyboard + gap - belowScreen.value - bottom) : 0;
    return { transform: [{ translateY: -lift }] };
  });

  const marker = (
    <View
      ref={anchor}
      collapsable={false}
      pointerEvents="none"
      onLayout={measure}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 0 }}
    />
  );

  return { style, marker };
}
