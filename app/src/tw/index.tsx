import {
  useCssElement,
  useNativeVariable as useFunctionalVariable,
} from "react-native-css";

import { Link as RouterLink } from "expo-router";
import Animated from "react-native-reanimated";
import React from "react";
import {
  View as RNView,
  Text as RNText,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  TouchableHighlight as RNTouchableHighlight,
  TextInput as RNTextInput,
  StyleSheet,
} from "react-native";

export const Link = (
  props: React.ComponentProps<typeof RouterLink> & { className?: string }
) => {
  // @ts-expect-error react-native-css generic inference is excessively deep here
  return useCssElement(RouterLink, props, { className: "style" });
};

Link.Trigger = RouterLink.Trigger;
Link.Menu = RouterLink.Menu;
Link.MenuAction = RouterLink.MenuAction;
Link.Preview = RouterLink.Preview;

export const useCSSVariable =
  process.env.EXPO_OS !== "web"
    ? useFunctionalVariable
    : (variable: string) => `var(${variable})`;

export type ViewProps = React.ComponentProps<typeof RNView> & {
  className?: string;
};

export const View = (props: ViewProps) => {
  return useCssElement(RNView, props, { className: "style" });
};
View.displayName = "CSS(View)";

function fixStyle(style: any): any {
  if (!style) return style;
  const flatStyle = StyleSheet.flatten(style);
  const fixed = { ...flatStyle, includeFontPadding: false };
  if (fixed.lineHeight && typeof fixed.lineHeight === 'number' && fixed.lineHeight < 10) {
    fixed.lineHeight = Math.round(fixed.lineHeight * (fixed.fontSize || 16));
  }
  return fixed;
}

const BaseText = React.forwardRef<RNText, React.ComponentProps<typeof RNText>>((props, ref) => {
  return <RNText {...props} style={fixStyle(props.style)} ref={ref} />;
});
BaseText.displayName = 'BaseText';

export const Text = (
  props: React.ComponentProps<typeof RNText> & { className?: string }
) => {
  return useCssElement(BaseText, props, { className: "style" });
};

const BaseTextInput = React.forwardRef<RNTextInput, React.ComponentProps<typeof RNTextInput>>((props, ref) => {
  return <RNTextInput {...props} style={fixStyle(props.style)} ref={ref} />;
});
BaseTextInput.displayName = 'BaseTextInput';

export const TextInput = (
  props: React.ComponentProps<typeof RNTextInput> & { className?: string }
) => {
  return useCssElement(BaseTextInput, props, { className: "style" });
};
Text.displayName = "CSS(Text)";

export const ScrollView = (
  props: React.ComponentProps<typeof RNScrollView> & {
    className?: string;
    contentContainerClassName?: string;
  }
) => {
  // @ts-expect-error react-native-css generic inference is excessively deep here
  return useCssElement(RNScrollView, props, {
    className: "style",
    contentContainerClassName: "contentContainerStyle",
  });
};
ScrollView.displayName = "CSS(ScrollView)";

export const Pressable = (
  props: React.ComponentProps<typeof RNPressable> & { className?: string }
) => {
  return useCssElement(RNPressable, props, { className: "style" });
};
Pressable.displayName = "CSS(Pressable)";

export const AnimatedScrollView = (
  props: React.ComponentProps<typeof Animated.ScrollView> & {
    className?: string;
    contentClassName?: string;
    contentContainerClassName?: string;
  }
) => {
  // @ts-expect-error react-native-css generic inference is excessively deep here
  return useCssElement(Animated.ScrollView, props, {
    className: "style",
    contentClassName: "contentContainerStyle",
    contentContainerClassName: "contentContainerStyle",
  });
};

function XXTouchableHighlight(
  props: React.ComponentProps<typeof RNTouchableHighlight>
) {
  const { underlayColor, ...style } =
    (StyleSheet.flatten(props.style) as { underlayColor?: string } & Record<string, unknown>) || {};
  return (
    <RNTouchableHighlight
      underlayColor={underlayColor as string | undefined}
      {...props}
      style={style}
    />
  );
}

export const TouchableHighlight = (
  props: React.ComponentProps<typeof RNTouchableHighlight>
) => {
  return useCssElement(XXTouchableHighlight, props, { className: "style" });
};
TouchableHighlight.displayName = "CSS(TouchableHighlight)";
