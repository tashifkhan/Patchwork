import { type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Leading Material Community icon. */
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  /** Minimum touch target height (default 52 — Paisa primary CTA height). */
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  accessibilityLabel?: string;
}

/**
 * RN-drawn Material 3 button. Used directly on iOS/web, and on Android
 * wherever a Compose `Host` cannot paint — inside the bottom sheet's Compose
 * tree (see `compose-host-context`).
 *
 * Lives in its own module so `button.android.tsx` can reuse it: importing
 * `./button` from there would resolve back to itself under Metro's platform
 * extension lookup.
 */
export function ButtonBase({
  label,
  onPress,
  variant = 'filled',
  disabled,
  loading,
  icon,
  minHeight = 52,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = Boolean(disabled || loading);

  // Loading keeps the variant's colors. Only a plain disabled button goes
  // neutral, so it doesn't read as a dimmed copy of the live one.
  const palette = disabled && !loading
    ? disabledColors(variant, colors)
    : variantColors(variant, colors);

  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              haptics.tap();
              onPress();
            }
          : undefined
      }
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => [
        {
          minHeight,
          width: '100%',
          alignSelf: 'stretch',
          opacity: pressed && !isDisabled ? 0.88 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
        style,
      ]}>
      <View
        className="w-full flex-row items-center justify-center gap-2 px-6"
        style={{
          minHeight,
          backgroundColor: palette.bg,
          borderWidth: variant === 'outlined' ? 1 : 0,
          borderColor: palette.border,
          borderRadius: 28,
          borderCurve: 'continuous',
        }}>
        {loading ? (
          <ActivityIndicator color={palette.fg} size="small" />
        ) : (
          <>
            {icon ? <MaterialCommunityIcons name={icon} size={18} color={palette.fg} /> : null}
            <Text className="text-base font-semibold" style={{ color: palette.fg }}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

/**
 * M3 disabled button: a 12% `onSurface` container under 38% `onSurface` text.
 * Fading the accent fill instead left accent-on-accent text that was hard to
 * read on dark sheets.
 */
function disabledColors(
  variant: ButtonVariant,
  colors: ReturnType<typeof useTheme>['colors']
): { bg: string; fg: string; border: string } {
  const filled = variant !== 'outlined' && variant !== 'text';
  return {
    bg: filled ? withAlpha(colors.text, 0.12) : 'transparent',
    fg: withAlpha(colors.text, 0.38),
    border: variant === 'outlined' ? withAlpha(colors.text, 0.12) : 'transparent',
  };
}

/** `#RGB` / `#RRGGBB` plus an alpha byte. Any other format comes back unchanged. */
function withAlpha(color: string, alpha: number): string {
  let hex = color.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) hex = `#${[...hex.slice(1)].map((c) => c + c).join('')}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return color;
  const byte = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${byte}`;
}

function variantColors(
  variant: ButtonVariant,
  colors: ReturnType<typeof useTheme>['colors']
): { bg: string; fg: string; border: string } {
  switch (variant) {
    case 'tonal':
      return { bg: colors.primaryContainer, fg: colors.onPrimaryContainer, border: 'transparent' };
    case 'outlined':
      return { bg: 'transparent', fg: colors.accent, border: colors.separator };
    case 'text':
      return { bg: 'transparent', fg: colors.accent, border: 'transparent' };
    case 'danger':
      return { bg: colors.danger, fg: '#FFFFFF', border: 'transparent' };
    case 'filled':
    default:
      return { bg: colors.accent, fg: colors.onAccent, border: 'transparent' };
  }
}
