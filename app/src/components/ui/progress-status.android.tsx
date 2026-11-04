import { CircularWavyProgressIndicator, Host } from '@expo/ui/jetpack-compose';
import { size as sizeModifier } from '@expo/ui/jetpack-compose/modifiers';
import Animated, { FadeIn, FadeOut, ZoomOut } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { DURATION } from '@/lib/motion';
import { Text, View } from '@/tw';

import { ProgressCheck } from './progress-check';
import type { ProgressStatusProps } from './progress-status';

/**
 * Material 3 Expressive progress: the circular *wavy* indicator while
 * working, which then gives way to a springing check mark when done.
 */
export function ProgressStatus({ state, label, size = 72 }: ProgressStatusProps) {
  const { colors } = useTheme();
  return (
    <View className="items-center" style={{ gap: 16 }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {state === 'done' ? (
          <ProgressCheck size={size} />
        ) : (
          <Animated.View exiting={ZoomOut.duration(DURATION.short3)}>
            <Host style={{ width: size, height: size }}>
              <CircularWavyProgressIndicator
                color={colors.accent}
                trackColor={colors.primaryContainer}
                modifiers={[sizeModifier(size, size)]}
              />
            </Host>
          </Animated.View>
        )}
      </View>
      <Animated.View
        key={label}
        entering={FadeIn.duration(DURATION.short4)}
        exiting={FadeOut.duration(DURATION.short3)}>
        <Text style={{ fontSize: 17, fontWeight: '500', color: colors.text, textAlign: 'center' }}>
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}
