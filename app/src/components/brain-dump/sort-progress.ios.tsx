import { Host, ProgressView } from '@expo/ui/swift-ui';
import { controlSize, tint } from '@expo/ui/swift-ui/modifiers';
import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { useLiquidGlass } from '@/components/ui/glass-surface';
import { Text, View } from '@/tw';

import type { SortProgressProps, SortStep } from './sort-progress-types';

const HEIGHT = 50;

/**
 * iOS, the way current system apps show work in progress: the Sort button
 * stays where it was and turns into a native spinner with its label (like the
 * App Store's Get button), and each step is a small glass capsule above it
 * that settles into a check. The dump card itself glows while the AI reads it
 * (see `DumpCard`), so nothing here needs a card of its own.
 */
export function SortProgress({ title, steps }: SortProgressProps) {
  const { colors, scheme } = useTheme();
  const glass = useLiquidGlass();
  const done = steps.filter((step) => step.state !== 'working').length;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`${title}. ${done} of ${steps.length} done.`}
      style={{ gap: 12 }}>
      <View className="flex-row flex-wrap items-center justify-center" style={{ gap: 8 }}>
        {steps.map((step) => (
          <StepCapsule key={step.key} step={step} />
        ))}
      </View>

      {/* The Sort button, mid-task: same place, same glass, a spinner instead of sparkles. */}
      {glass ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={scheme}
          tintColor={colors.accent}
          style={{ height: HEIGHT, borderRadius: HEIGHT / 2 }}>
          <BusyLabel title={title} />
        </GlassView>
      ) : (
        <View style={{ height: HEIGHT, borderRadius: HEIGHT / 2, borderCurve: 'continuous', backgroundColor: colors.accent }}>
          <BusyLabel title={title} />
        </View>
      )}
    </View>
  );
}

function BusyLabel({ title }: { title: string }) {
  return (
    <View className="flex-1 flex-row items-center justify-center" style={{ gap: 10 }}>
      <Host matchContents>
        <ProgressView modifiers={[tint('#FFFFFF'), controlSize('regular')]} />
      </Host>
      <Text style={{ fontSize: 17, fontWeight: '600', color: '#FFFFFF' }}>{title}</Text>
    </View>
  );
}

function StepCapsule({ step }: { step: SortStep }) {
  const { colors, scheme } = useTheme();
  const glass = useLiquidGlass();
  const label = step.short[step.state];
  const content = (
    <Animated.View
      key={step.state}
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(120)}
      // Plain styles: Reanimated's Animated.View doesn't take Tailwind classes.
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12 }}>
      {step.state === 'working' ? (
        <Host matchContents>
          <ProgressView modifiers={[controlSize('mini')]} />
        </Host>
      ) : (
        <SymbolView
          name={step.state === 'done' ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'}
          size={15}
          tintColor={step.state === 'done' ? colors.green : colors.orange}
          animationSpec={{ effect: { type: 'bounce', wholeSymbol: true } }}
        />
      )}
      <Text style={{ fontSize: 13, fontWeight: '500', color: step.state === 'working' ? colors.text : colors.text2 }}>
        {label}
      </Text>
    </Animated.View>
  );
  return (
    <Animated.View layout={LinearTransition.duration(200)}>
      {glass ? (
        <GlassView glassEffectStyle="regular" colorScheme={scheme} style={{ borderRadius: 16 }}>
          {content}
        </GlassView>
      ) : (
        <View style={{ borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.bg3 }}>{content}</View>
      )}
    </Animated.View>
  );
}
