import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { COLLAPSE_OUT, EXPAND_IN, EXPRESSIVE } from '@/lib/motion';
import { haptics } from '@/lib/haptics';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

import { type StatusAction, type StatusBannerProps, toneColor } from './status-banner-types';

const ENTER = FadeInDown.springify().damping(EXPRESSIVE.entrance.damping).stiffness(EXPRESSIVE.entrance.stiffness);
const LAYOUT = LinearTransition.springify().damping(EXPRESSIVE.entrance.damping).stiffness(EXPRESSIVE.entrance.stiffness);

/**
 * Material 3 banner: a tone-tinted container at the expressive 28dp corner,
 * a tonal icon disc, supporting text, and actions on a trailing row.
 * Raw error text hides behind "Details" so the banner stays readable.
 */
export function StatusBanner({ tone, icon, title, body, detail, primary, secondary, onDismiss }: StatusBannerProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const color = toneColor(colors, tone);
  // A filled action on a warm tone reads better with the surface color on it.
  const onColor = tone === 'info' ? colors.onAccent : colors.bg;

  return (
    <Animated.View entering={ENTER} exiting={FadeOut.duration(150)} layout={LAYOUT} style={{ marginTop: 8 }}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{ backgroundColor: colors.bg2, borderRadius: 28, overflow: 'hidden' }}>
        <View style={{ backgroundColor: withAlpha(color, 0.1), padding: 16, paddingBottom: 12, gap: 12 }}>
          <Animated.View key={title} entering={FadeIn.duration(200)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: withAlpha(color, 0.18),
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <MaterialCommunityIcons name={icon} size={22} color={color} />
            </View>
            <View style={{ flex: 1, gap: 2, paddingTop: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{title}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>{body}</Text>
              {detail && open ? (
                <Animated.View entering={EXPAND_IN} exiting={COLLAPSE_OUT}>
                  <Text
                    selectable
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      lineHeight: 17,
                      color: colors.text3,
                      fontFamily: 'monospace',
                    }}>
                    {detail}
                  </Text>
                </Animated.View>
              ) : null}
            </View>
            {onDismiss ? (
              <Pressable
                onPress={() => {
                  haptics.tap();
                  onDismiss();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                android_ripple={{ color: withAlpha(colors.text, 0.12), borderless: true, radius: 20 }}
                style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -6 }}>
                <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
              </Pressable>
            ) : null}
          </Animated.View>

          <View className="flex-row items-center justify-end" style={{ gap: 8 }}>
            {detail ? (
              <Action
                label={open ? 'Hide details' : 'Details'}
                fg={colors.text2}
                onPress={() => setOpen((value) => !value)}
              />
            ) : null}
            {secondary ? <Action {...secondary} fg={color} /> : null}
            {primary ? <Action {...primary} fg={onColor} bg={color} /> : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function Action({ label, onPress, busy, fg, bg }: StatusAction & { fg: string; bg?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(busy), disabled: Boolean(busy) }}
      disabled={busy}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      android_ripple={{ color: withAlpha(fg, 0.2) }}
      style={({ pressed }) => ({
        minHeight: 40,
        paddingHorizontal: 16,
        // M3 Expressive: the pill squares off under a finger.
        borderRadius: pressed ? 12 : 20,
        overflow: 'hidden',
        backgroundColor: bg ?? 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      })}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text style={{ fontSize: 14, fontWeight: '600', color: fg }}>{busy ? 'Retrying' : label}</Text>
    </Pressable>
  );
}
