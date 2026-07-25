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

import { ThemeContext } from "@/components/theme/context";
import type { ThemeColors } from "@/lib/theme";

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
  const { colors } = React.useContext(ThemeContext);
  const backgroundColor = semanticBackgroundColor(props.className, colors);
  const nextProps = backgroundColor
    ? { ...props, style: [props.style, { backgroundColor }] }
    : props;
  return useCssElement(RNView, nextProps, { className: "style" });
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

function semanticTextColor(className: string | undefined, colors: ThemeColors) {
  if (!className) return undefined;

  const names = className.split(/\s+/);
  let token: string | undefined;
  for (let index = names.length - 1; index >= 0; index -= 1) {
    if (names[index].startsWith('text-sf-')) {
      token = names[index];
      break;
    }
  }
  switch (token) {
    case 'text-sf-blue': return colors.accent;
    case 'text-sf-green': return colors.green;
    case 'text-sf-red': return colors.red;
    case 'text-sf-orange': return colors.orange;
    case 'text-sf-yellow': return colors.yellow;
    case 'text-sf-purple': return colors.purple;
    case 'text-sf-gray': return colors.gray;
    case 'text-sf-gray-2': return colors.gray2;
    case 'text-sf-gray-3': return colors.gray3;
    case 'text-sf-text': return colors.text;
    case 'text-sf-text-2': return colors.text2;
    case 'text-sf-text-3': return colors.text3;
    case 'text-sf-on-accent': return colors.onAccent;
    case 'text-sf-on-selection': return colors.onSelectionBg;
    default: return undefined;
  }
}

function semanticBackgroundColor(className: string | undefined, colors: ThemeColors) {
  if (!className) return undefined;

  const names = className.split(/\s+/);
  let token: string | undefined;
  for (let index = names.length - 1; index >= 0; index -= 1) {
    if (names[index].startsWith('bg-sf-')) {
      token = names[index];
      break;
    }
  }
  switch (token) {
    case 'bg-sf-blue': return colors.accent;
    case 'bg-sf-green': return colors.green;
    case 'bg-sf-red': return colors.red;
    case 'bg-sf-orange': return colors.orange;
    case 'bg-sf-yellow': return colors.yellow;
    case 'bg-sf-purple': return colors.purple;
    case 'bg-sf-gray': return colors.gray;
    case 'bg-sf-gray-2': return colors.gray2;
    case 'bg-sf-gray-3': return colors.gray3;
    case 'bg-sf-bg': return colors.bg;
    case 'bg-sf-bg-2': return colors.bg2;
    case 'bg-sf-bg-3': return colors.bg3;
    case 'bg-sf-separator': return colors.separator;
    case 'bg-sf-selection': return colors.selectionBg;
    default: return undefined;
  }
}

export const Text = (
  props: React.ComponentProps<typeof RNText> & { className?: string }
) => {
  const { colors } = React.useContext(ThemeContext);
  const color = semanticTextColor(props.className, colors);
  const nextProps = color ? { ...props, style: [props.style, { color }] } : props;
  return useCssElement(BaseText, nextProps, { className: "style" });
};

const BaseTextInput = React.forwardRef<RNTextInput, React.ComponentProps<typeof RNTextInput>>((props, ref) => {
  return <RNTextInput {...props} style={fixStyle(props.style)} ref={ref} />;
});
BaseTextInput.displayName = 'BaseTextInput';

export const TextInput = (
  props: React.ComponentProps<typeof RNTextInput> & { className?: string }
) => {
  const { colors } = React.useContext(ThemeContext);
  const color = semanticTextColor(props.className, colors);
  const backgroundColor = semanticBackgroundColor(props.className, colors);
  const semanticStyle = {
    ...(color ? { color } : null),
    ...(backgroundColor ? { backgroundColor } : null),
  };
  const nextProps = color || backgroundColor
    ? { ...props, style: [props.style, semanticStyle] }
    : props;
  return useCssElement(BaseTextInput, nextProps, { className: "style" });
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
