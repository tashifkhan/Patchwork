import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { ElasticPressable } from '@/components/ui/motion';
import { haptics } from '@/lib/haptics';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** iOS 26+: floating bars are Liquid Glass capsules. */
export const TOOLBAR_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

/** Height of a toolbar button. The bar is this plus 8 of padding each side. */
export const TOOLBAR_BUTTON = TOOLBAR_GLASS ? 48 : 56;
/** Button size in dense bars, so five actions and a pill still fit a phone. */
const DENSE_BUTTON = 48;

/**
 * The one floating toolbar surface (to-do page, open to-do, multi-select,
 * Deck cards). Android and older iOS: a `bg3` pill with a deep shadow, which
 * stays dark on AMOLED black instead of lifting into a tinted brown slab.
 * iOS 26+: Liquid Glass.
 */
export function ToolbarSurface({
  children,
  dense,
  style,
}: {
  children: ReactNode;
  /** Tighter gaps for bars with many buttons (pair with `dense` buttons). */
  dense?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme } = useTheme();
  const layout: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dense ? 4 : 8,
    padding: 8,
    borderRadius: (dense ? DENSE_BUTTON : TOOLBAR_BUTTON) / 2 + 8,
    borderCurve: 'continuous',
  };
  if (TOOLBAR_GLASS) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive colorScheme={scheme} style={[layout, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View
      style={[
        layout,
        {
          backgroundColor: colors.bg3,
          boxShadow: `0 8px 24px ${withAlpha('#000000', scheme === 'dark' ? 0.5 : 0.14)}`,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/** A round tonal icon button. Its corners tighten while held (M3 Expressive). */
export function ToolbarIconButton({
  icon,
  sf,
  label,
  color,
  dense,
  onPress,
}: {
  icon: IconName;
  /** SF Symbol for the iOS glass bar. */
  sf: SFSymbol;
  label: string;
  /** Glyph color. Defaults to the text color. */
  color?: string;
  dense?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.text;
  const size = dense ? DENSE_BUTTON : TOOLBAR_BUTTON;
  return (
    <ElasticPressable
      variant="button"
      radius={size / 2}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.separator, borderless: true, radius: size / 2 }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: pressed ? size / 3 : size / 2,
        borderCurve: 'continuous',
        backgroundColor: TOOLBAR_GLASS ? 'transparent' : withAlpha(colors.text, pressed ? 0.1 : 0.05),
        opacity: pressed && Platform.OS === 'ios' ? 0.6 : 1,
      })}>
      {TOOLBAR_GLASS ? (
        <SymbolView name={sf} size={22} tintColor={tint} weight="medium" />
      ) : (
        <MaterialCommunityIcons name={icon} size={24} color={tint} />
      )}
    </ElasticPressable>
  );
}

/** The bar's main action: a filled accent pill. */
export function ToolbarPrimaryButton({
  icon,
  sf,
  label,
  accessibilityLabel,
  onPress,
  disabled,
  grow,
  dense,
  children,
}: {
  icon: IconName;
  sf: SFSymbol;
  /** Text after the icon. Ignored when `children` is given. */
  label?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Fill the rest of the bar (a full-width bar), instead of hugging the label. */
  grow?: boolean;
  dense?: boolean;
  /** Custom content after the icon, e.g. a rolling count. */
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const height = dense ? DENSE_BUTTON : TOOLBAR_BUTTON;
  return (
    <ElasticPressable
      variant="control"
      containerStyle={grow ? { flexGrow: 1 } : undefined}
      radius={height / 2}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      android_ripple={{ color: withAlpha('#FFFFFF', 0.2) }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height,
        paddingLeft: 18,
        paddingRight: 22,
        // Expressive shape morph: the pill squares off while held.
        borderRadius: pressed ? height / 4 : height / 2,
        borderCurve: 'continuous',
        overflow: 'hidden',
        backgroundColor: colors.accent,
        opacity: disabled ? 0.5 : pressed && Platform.OS === 'ios' ? 0.85 : 1,
      })}>
      {TOOLBAR_GLASS ? (
        <SymbolView name={sf} size={18} tintColor={colors.onAccent} weight="semibold" />
      ) : (
        <MaterialCommunityIcons name={icon} size={22} color={colors.onAccent} />
      )}
      {children ?? <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '700' }}>{label}</Text>}
    </ElasticPressable>
  );
}
