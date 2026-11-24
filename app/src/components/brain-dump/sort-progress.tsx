import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { GlassSurface } from '@/components/ui/glass-surface';
import { Text, View } from '@/tw';

import type { SortProgressProps, SortStep } from './sort-progress-types';

/** Web fallback. iOS and Android have their own native versions. */
export function SortProgress({ title, steps }: SortProgressProps) {
  const { colors } = useTheme();
  const done = steps.filter((step) => step.state !== 'working').length;

  return (
    <GlassSurface radius={26}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${title}. ${done} of ${steps.length} done.`}
        style={{ padding: 18, gap: 14 }}>
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>{title}</Text>
        </View>
        <View style={{ gap: 10 }}>
          {steps.map((step) => (
            <StepRow key={step.key} step={step} />
          ))}
        </View>
      </View>
    </GlassSurface>
  );
}

function StepRow({ step }: { step: SortStep }) {
  const { colors } = useTheme();
  const label = step.state === 'done' ? step.doneLabel : step.state === 'failed' ? step.failedLabel : step.label;
  return (
    <View className="flex-row items-center" style={{ gap: 12, minHeight: 28 }}>
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        {step.state === 'working' ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Animated.View key={step.state} entering={ZoomIn.springify()}>
            <SymbolView
              name={step.state === 'done' ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'}
              size={22}
              tintColor={step.state === 'done' ? colors.green : colors.orange}
              fallback={
                <MaterialCommunityIcons
                  name={step.state === 'done' ? 'check-circle' : 'alert'}
                  size={22}
                  color={step.state === 'done' ? colors.green : colors.orange}
                />
              }
            />
          </Animated.View>
        )}
      </View>
      <Animated.Text
        key={label}
        entering={FadeIn.duration(180)}
        style={{ flex: 1, fontSize: 15, color: step.state === 'working' ? colors.text : colors.text2 }}>
        {label}
      </Animated.Text>
    </View>
  );
}
