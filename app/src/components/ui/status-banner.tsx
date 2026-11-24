import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { GlassSurface, useLiquidGlass } from '@/components/ui/glass-surface';
import { haptics } from '@/lib/haptics';
import { EXPRESSIVE } from '@/lib/motion';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

import { type StatusBannerProps, toneColor } from './status-banner-types';

const LAYOUT = LinearTransition.springify().damping(EXPRESSIVE.entrance.damping).stiffness(EXPRESSIVE.entrance.stiffness);

/**
 * iOS: a tinted Liquid Glass card. SF Symbol, title and one line of
 * detail, an interactive glass capsule for the main action, and quiet text
 * links for the rest. Before iOS 26 (and on web) the glass falls back to
 * the grouped surface.
 */
export function StatusBanner({ tone, icon, sf, title, body, detail, primary, secondary, onDismiss }: StatusBannerProps) {
  const { colors, scheme } = useTheme();
  const glass = useLiquidGlass();
  const [open, setOpen] = useState(false);
  const color = toneColor(colors, tone);

  const capsule = primary ? (
    <View className="flex-row items-center px-4" style={{ height: 34, gap: 6 }}>
      {primary.busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
      <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>{primary.busy ? 'Retrying' : primary.label}</Text>
    </View>
  ) : null;

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} layout={LAYOUT} style={{ marginTop: 8 }}>
      <GlassSurface radius={22} tintColor={withAlpha(color, scheme === 'dark' ? 0.16 : 0.1)}>
        <View accessibilityRole="alert" className="flex-row items-start" style={{ gap: 12, padding: 14, paddingRight: 12 }}>
          <SymbolView
            name={sf}
            size={24}
            weight="medium"
            tintColor={color}
            animationSpec={primary?.busy ? { effect: { type: 'pulse', wholeSymbol: true }, repeating: true } : undefined}
            fallback={<MaterialCommunityIcons name={icon} size={24} color={color} />}
            style={{ width: 28, height: 28, marginTop: 2 }}
          />
          <Animated.View key={title} entering={FadeIn.duration(200)} style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>{title}</Text>
            <Text style={{ fontSize: 13, lineHeight: 18, color: colors.text2 }}>{body}</Text>
            {detail && open ? (
              <Text selectable style={{ marginTop: 4, fontSize: 12, lineHeight: 16, color: colors.text3, fontFamily: 'Menlo' }}>
                {detail}
              </Text>
            ) : null}
            {detail || secondary ? (
              <View className="flex-row" style={{ gap: 16, marginTop: 6 }}>
                {secondary ? (
                  <Link label={secondary.label} color={color} onPress={secondary.onPress} />
                ) : null}
                {detail ? (
                  <Link
                    label={open ? 'Hide details' : 'Details'}
                    color={colors.text2}
                    onPress={() => setOpen((value) => !value)}
                  />
                ) : null}
              </View>
            ) : null}
          </Animated.View>
          {primary ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={primary.label}
              accessibilityState={{ busy: Boolean(primary.busy), disabled: Boolean(primary.busy) }}
              disabled={primary.busy}
              hitSlop={6}
              onPress={() => {
                haptics.tap();
                primary.onPress();
              }}
              style={({ pressed }) => ({ opacity: !glass && pressed ? 0.7 : 1, alignSelf: 'center' })}>
              {glass ? (
                <GlassView isInteractive glassEffectStyle="regular" colorScheme={scheme} tintColor={color} style={{ borderRadius: 17 }}>
                  {capsule}
                </GlassView>
              ) : (
                <View style={{ borderRadius: 17, borderCurve: 'continuous', backgroundColor: color }}>{capsule}</View>
              )}
            </Pressable>
          ) : null}
          {onDismiss ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss"
              hitSlop={10}
              onPress={() => {
                haptics.selection();
                onDismiss();
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, alignSelf: 'flex-start', marginTop: -2 })}>
              <SymbolView
                name="xmark.circle.fill"
                size={22}
                tintColor={colors.text3}
                fallback={<MaterialCommunityIcons name="close-circle" size={22} color={colors.text3} />}
              />
            </Pressable>
          ) : null}
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

function Link({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <Text style={{ fontSize: 13, fontWeight: '600', color }}>{label}</Text>
    </Pressable>
  );
}
