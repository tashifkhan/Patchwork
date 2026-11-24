import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { useElasticPress } from '@/components/ui/elastic';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

import type { ListHeroProps } from './list-hero-types';

/**
 * Android: the list name as a Material 3 Expressive selector: a large title
 * with a tonal chevron and the count under it. The whole row gives under a
 * finger. Tapping opens My lists, the app's one list switcher.
 */
export function ListHero({ title, subtitle, onPress }: ListHeroProps) {
  const { colors } = useTheme();
  const press = useElasticPress({ maxStretch: 0.02, maxTranslate: 1.5, pressedScale: 0.97, releaseOnDrag: true });

  return (
    <Animated.View {...press.handlers} style={[press.style, { alignSelf: 'flex-start', maxWidth: '100%' }]}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${subtitle}. Switch list`}
        style={{ paddingVertical: 4, paddingRight: 4 }}>
          <View style={{ flexShrink: 1 }}>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontSize: 30,
                  lineHeight: 36,
                  fontWeight: '700',
                  letterSpacing: -0.4,
                  color: colors.text,
                }}>
                {title}
              </Text>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.selectionBg,
                }}>
                <MaterialCommunityIcons name="chevron-down" size={20} color={colors.onSelectionBg} />
              </View>
            </View>
            {/* Keyed by its text: Android can leave the old count half-drawn when
                it changes in place inside the elastic (scaled) row. */}
            <Text key={subtitle} numberOfLines={1} style={{ fontSize: 14, color: colors.text2 }}>
              {subtitle}
            </Text>
          </View>
      </Pressable>
    </Animated.View>
  );
}
