import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { ActivityIndicator, Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { useLiquidGlass } from '@/components/ui/glass-surface';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

import { ButtonBase, type ButtonProps } from './button-base';

export type { ButtonProps, ButtonVariant } from './button-base';

/** SF Symbols for the Material icons buttons pass, so iOS glyphs match the system. */
const SF: Partial<Record<NonNullable<ButtonProps['icon']>, SFSymbol>> = {
  play: 'play.fill',
  pause: 'pause.fill',
  stop: 'stop.fill',
  camera: 'camera.fill',
  'camera-outline': 'camera',
  'clipboard-arrow-down-outline': 'doc.on.clipboard',
  'content-save-outline': 'square.and.arrow.down',
  'share-variant': 'square.and.arrow.up',
  'share-variant-outline': 'square.and.arrow.up',
  'content-copy': 'doc.on.doc',
  check: 'checkmark',
  plus: 'plus',
  'trash-can-outline': 'trash',
  refresh: 'arrow.clockwise',
  restore: 'arrow.uturn.backward',
  creation: 'sparkles',
  microphone: 'mic.fill',
  'cog-outline': 'gearshape',
  'qrcode-scan': 'qrcode.viewfinder',
};

/**
 * iOS button. On iOS 26 it is the system's glass push button: interactive
 * Liquid Glass in a capsule, accent-tinted for the main action (`filled`,
 * `danger`) like SwiftUI's `.glassProminent`, clear for the others (`tonal`,
 * `outlined`) like `.glass`, and a plain borderless label for `text`.
 * Interactive glass supplies the press response, so nothing fades on top.
 * Older iOS keeps the RN-drawn button.
 */
export function Button(props: ButtonProps) {
  const glass = useLiquidGlass();
  if (!glass) return <ButtonBase {...props} />;
  return <GlassButton {...props} />;
}

function GlassButton({
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
  const { colors, scheme } = useTheme();
  const isDisabled = Boolean(disabled || loading);
  const prominent = variant === 'filled' || variant === 'danger';
  const plain = variant === 'text';
  const tint = !prominent || disabled ? undefined : variant === 'danger' ? colors.danger : colors.accent;
  const ink = plain ? colors.accent : tint ? '#FFFFFF' : variant === 'danger' ? colors.danger : colors.text;
  const height = Math.max(44, Math.min(minHeight, 56));
  const symbol = icon ? SF[icon] : undefined;

  const content = loading ? (
    <ActivityIndicator color={ink} size="small" />
  ) : (
    <View className="flex-row items-center justify-center gap-2">
      {symbol ? (
        <SymbolView name={symbol} size={17} weight="semibold" tintColor={ink} />
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={18} color={ink} />
      ) : null}
      <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '600', color: ink }}>
        {label}
      </Text>
    </View>
  );

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
      style={({ pressed }) => [
        { minHeight: height, width: '100%', alignSelf: 'stretch', opacity: disabled ? 0.4 : plain && pressed ? 0.5 : 1 },
        style,
      ]}>
      {plain ? (
        <View style={{ minHeight: height, alignItems: 'center', justifyContent: 'center' }}>{content}</View>
      ) : (
        <GlassView
          isInteractive={!isDisabled}
          glassEffectStyle="regular"
          tintColor={tint}
          colorScheme={scheme}
          style={{
            minHeight: height,
            borderRadius: height / 2,
            borderCurve: 'continuous',
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}>
          {content}
        </GlassView>
      )}
    </Pressable>
  );
}
