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
  fill: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});

/**
 * iOS 26 glass push button, the SwiftUI `.glassProminent` / `.glass` look:
 * interactive Liquid Glass in a capsule, tinted with the accent for the
 * primary action and clear for the rest. Interactive glass gives the system
 * press response (it swells and lights up under the finger), so there is no
 * opacity fade on top. Without glass (iOS < 26) it falls back to a solid
 * capsule, filled for the primary action and gray for the rest.
 */
export function GlassPillButton({
  label,
  sf,
  onPress,
  prominent = false,
  disabled = false,
  height = 50,
  tint,
  accessibilityLabel,
  style,
}: {
  label: string;
  sf?: SFSymbol;
  onPress: () => void;
  /** Accent-tinted glass for the screen's main action. */
  prominent?: boolean;
  disabled?: boolean;
  height?: number;
  /** Overrides the prominent tint, e.g. red for a destructive action. */
  tint?: string;
  accessibilityLabel?: string;
  /** Layout for the button itself: flex, alignSelf, margins. */
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme } = useTheme();
  const glass = useLiquidGlass();
  const fill = prominent ? (tint ?? colors.accent) : undefined;
  const ink = prominent ? '#FFFFFF' : colors.text;
  const shape: ViewStyle = { height, borderRadius: height / 2, borderCurve: 'continuous' };
  const content = (
    <View style={styles.row}>
      {sf ? <SymbolView name={sf} size={17} weight="semibold" tintColor={ink} /> : null}
      <Text style={{ fontSize: 17, fontWeight: '600', color: ink }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [shape, { opacity: disabled ? 0.4 : !glass && pressed ? 0.75 : 1 }, style]}>
      {glass ? (
        <GlassView
          isInteractive={!disabled}
          glassEffectStyle="regular"
          tintColor={fill}
          colorScheme={scheme}
          style={[shape, styles.fill]}>
          {content}
        </GlassView>
      ) : (
        <View style={[shape, styles.fill, { backgroundColor: fill ?? colors.bg3 }]}>{content}</View>
      )}
    </Pressable>
  );
}
