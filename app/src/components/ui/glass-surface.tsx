import { GlassView, isLiquidGlassAvailable, type GlassStyle } from 'expo-glass-effect';
import { type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme/context';

/** True when the OS can render Apple's liquid glass (iOS 26+). */
export function useLiquidGlass(): boolean {
  return Platform.OS === 'ios' && isLiquidGlassAvailable();
}

export interface GlassSurfaceProps {
  children: ReactNode;
  /** Corner radius; continuous curve on both platforms. */
  radius?: number;
  /** Glass material on iOS 26+. `clear` reads lighter over busy content. */
  glassEffectStyle?: GlassStyle;
  /** Fill used when glass is unavailable (Android, iOS < 26, web). */
  fallbackColor?: string;
  /** Soft drop shadow on the fallback surface. Glass provides its own depth. */
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's one elevated surface: liquid glass on iOS 26+, a themed solid
 * elsewhere. Everything that floats above the background — settings groups,
 * the chat composer, chat bubbles — goes through this so the two platforms
 * stay visually in step without each screen re-deriving the check.
 */
export function GlassSurface({
  children,
  radius = 24,
  glassEffectStyle = 'regular',
  fallbackColor,
  shadow = true,
  style,
}: GlassSurfaceProps) {
  const { colors, scheme } = useTheme();
  const glass = useLiquidGlass();

  const shape: ViewStyle = {
    borderRadius: radius,
    borderCurve: 'continuous',
    overflow: 'hidden',
  };

  if (glass) {
    return (
      <GlassView glassEffectStyle={glassEffectStyle} colorScheme={scheme} style={[shape, style]}>
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        shape,
        {
          backgroundColor: fallbackColor ?? colors.bg2,
          ...(shadow
            ? {
                boxShadow:
                  Platform.OS === 'android'
                    ? `0 1px 2px ${colors.separator}88`
                    : `0 1px 3px ${colors.separator}`,
              }
            : null),
        },
        style,
      ]}>
      {children}
    </View>
  );
}
