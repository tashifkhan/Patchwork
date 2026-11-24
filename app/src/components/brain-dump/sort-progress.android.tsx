import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Host, LinearWavyProgressIndicator, LoadingIndicator } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, size } from '@expo/ui/jetpack-compose/modifiers';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { PAISA } from '@/lib/motion';
import { Text, View } from '@/tw';

import type { SortProgressProps, SortStep } from './sort-progress-types';

const POP = ZoomIn.springify().damping(PAISA.arrow.damping).stiffness(PAISA.arrow.stiffness);

/**
 * M3 Expressive progress card: a wavy linear indicator that runs until every
 * step settles, then one row per step with the morphing loading indicator
 * turning into a check (or a warning) as each finishes.
 */
export function SortProgress({ title, steps }: SortProgressProps) {
  const { colors } = useTheme();
  const finished = steps.every((step) => step.state !== 'working');
  const done = steps.filter((step) => step.state !== 'working').length;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${done} of ${steps.length} done.`}
      style={{ backgroundColor: colors.bg3, borderRadius: 28, borderCurve: 'continuous', padding: 20, gap: 16 }}>
      <View className="flex-row items-center justify-between">
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{title}</Text>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
          {done}/{steps.length}
        </Text>
      </View>

      <Host style={{ width: '100%', height: 16 }}>
        <LinearWavyProgressIndicator
          // Indeterminate while anything runs; a full, still bar once it's all settled.
          progress={finished ? 1 : null}
          color={colors.accent}
          trackColor={colors.primaryContainer}
          modifiers={[fillMaxWidth()]}
        />
      </Host>

      <View style={{ gap: 4 }}>
        {steps.map((step) => (
          <StepRow key={step.key} step={step} />
        ))}
      </View>
    </View>
  );
}

function StepRow({ step }: { step: SortStep }) {
  const { colors } = useTheme();
  const label = step.state === 'done' ? step.doneLabel : step.state === 'failed' ? step.failedLabel : step.label;
  return (
    <View className="flex-row items-center" style={{ gap: 12, minHeight: 40 }}>
      <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
        {step.state === 'working' ? (
          <Host style={{ width: 32, height: 32 }}>
            <LoadingIndicator color={colors.accent} modifiers={[size(32, 32)]} />
          </Host>
        ) : (
          <Animated.View
            key={step.state}
            entering={POP}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: step.state === 'done' ? colors.primaryContainer : colors.orange,
            }}>
            <MaterialCommunityIcons
              name={step.state === 'done' ? 'check' : 'exclamation'}
              size={18}
              color={step.state === 'done' ? colors.onPrimaryContainer : colors.bg}
            />
          </Animated.View>
        )}
      </View>
      <Animated.Text
        key={label}
        entering={FadeIn.duration(180)}
        style={{
          flex: 1,
          fontSize: 15,
          color: step.state === 'working' ? colors.text : colors.text2,
          fontWeight: step.state === 'working' ? '600' : '400',
        }}>
        {label}
      </Animated.Text>
    </View>
  );
}
