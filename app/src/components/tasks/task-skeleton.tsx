import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { View } from '@/tw';

interface ShimmerBlockProps {
  width: number | `${number}%`;
  height: number;
  radius?: number;
}

function ShimmerBlock({ width, height, radius = 6 }: ShimmerBlockProps) {
  const { colors, scheme } = useTheme();
  const progress = useSharedValue(0.4);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const style = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius: radius,
          backgroundColor: scheme === 'dark' ? colors.bg3 : colors.bg2,
        },
        style,
      ]}
    />
  );
}

function SkeletonRow({ widthPct }: { widthPct: `${number}%` }) {
  return (
    <View className="flex-row items-start gap-3 py-2">
      <ShimmerBlock width={22} height={22} radius={6} />
      <View className="flex-1 gap-2">
        <ShimmerBlock width={widthPct} height={14} />
        <ShimmerBlock width="60%" height={12} />
      </View>
    </View>
  );
}

function SkeletonSection({ rows }: { rows: `${number}%`[] }) {
  return (
    <View className="pt-4">
      <View className="py-1">
        <ShimmerBlock width={120} height={12} />
      </View>
      <View className="pt-1">
        {rows.map((w, i) => (
          <SkeletonRow key={i} widthPct={w} />
        ))}
      </View>
    </View>
  );
}

export function TaskListSkeleton() {
  return (
    <View>
      <SkeletonSection rows={['85%', '70%', '55%']} />
      <SkeletonSection rows={['78%', '62%']} />
    </View>
  );
}
