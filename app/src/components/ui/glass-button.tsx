import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useLiquidGlass } from '@/components/ui/glass-surface';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * iOS 26 toolbar-style circular button: interactive Liquid Glass with an SF
 * Symbol. Before iOS 26 it falls back to a filled gray circle, the way the
 * system draws bar buttons on older releases. iOS screens only; Android
 * keeps its Material buttons.
 */
export function GlassIconButton({
  sf,
  icon,
  label,
  onPress,
  size = 44,
  tint,
  symbolColor,
  badge = 0,
  style,
}: {
  sf: SFSymbol;
  /** Fallback glyph if SF Symbols are unavailable (never on iOS). */
  icon?: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  /** Tints the glass, e.g. the accent for a primary action. */
  tint?: string;
  symbolColor?: string;
  /** Small count in the corner, e.g. active filters. */
  badge?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme } = useTheme();
  const glass = useLiquidGlass();
  const color = symbolColor ?? (tint ? '#FFFFFF' : colors.text);
  const shape: ViewStyle = { width: size, height: size, borderRadius: size / 2 };

  const glyph = (
    <SymbolView
      name={sf}
      size={Math.round(size * 0.45)}
      weight="medium"
      tintColor={color}
      fallback={icon ? <MaterialCommunityIcons name={icon} size={Math.round(size * 0.5)} color={color} /> : undefined}
    />
  );

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${label}, ${badge} on` : label}
      hitSlop={4}
      style={({ pressed }) => [shape, { opacity: !glass && pressed ? 0.6 : 1 }, style]}>
      {glass ? (
        <GlassView
          isInteractive
          glassEffectStyle="regular"
          tintColor={tint}
          colorScheme={scheme}
          style={[shape, styles.center]}>
          {glyph}
        </GlassView>
      ) : (
        <View style={[shape, styles.center, { backgroundColor: tint ?? colors.bg2 }]}>{glyph}</View>
      )}
      {badge > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 5,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
          }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.onAccent }}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
