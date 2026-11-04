import { ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { DURATION } from '@/lib/motion';
import { Text, View } from '@/tw';

import { ProgressCheck } from './progress-check';

export interface ProgressStatusProps {
  /** `working` spins; `done` swaps the indicator for a check. */
  state: 'working' | 'done';
  label: string;
  /** Indicator diameter. Default 72. */
  size?: number;
}

/**
 * Indeterminate progress that resolves into a check mark. iOS/web use the
 * native spinner; Android swaps in the M3 circular wavy indicator
 * (`progress-status.android.tsx`).
 */
export function ProgressStatus({ state, label, size = 72 }: ProgressStatusProps) {
  const { colors } = useTheme();
  return (
    <View className="items-center" style={{ gap: 16 }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {state === 'done' ? (
          <ProgressCheck size={size} />
        ) : (
          <ActivityIndicator size="large" color={colors.accent} />
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
