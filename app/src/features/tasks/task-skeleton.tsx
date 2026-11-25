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

function ShimmerBlock({ width, height, radius = 10 }: ShimmerBlockProps) {
  const { colors, scheme } = useTheme();
  const progress = useSharedValue(0.35);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
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
    <View className="flex-row items-center gap-3 py-3">
      <ShimmerBlock width={28} height={28} radius={14} />
      <View className="flex-1 gap-2.5">
        <ShimmerBlock width={widthPct} height={15} radius={8} />
        <ShimmerBlock width="55%" height={12} radius={6} />
      </View>
      <ShimmerBlock width={40} height={12} radius={6} />
    </View>
  );
}

function SkeletonCard() {
  return (
    <View
      className="gap-3 rounded-2xl p-4"
      style={{ backgroundColor: 'transparent' }}>
      <ShimmerBlock width="40%" height={11} radius={6} />
      <ShimmerBlock width="90%" height={16} radius={8} />
      <ShimmerBlock width="70%" height={12} radius={6} />
      <View className="flex-row gap-2 pt-1">
        <ShimmerBlock width={64} height={22} radius={11} />
        <ShimmerBlock width={52} height={22} radius={11} />
      </View>
    </View>
  );
}

function SkeletonSection({ rows }: { rows: `${number}%`[] }) {
  return (
    <View className="pt-5">
      <View className="mb-2 py-1">
        <ShimmerBlock width={100} height={12} radius={6} />
      </View>
      <View
        className="rounded-3xl px-3 py-1"
        style={{ borderCurve: 'continuous' }}>
        {rows.map((w, i) => (
          <View key={i}>
            {i > 0 ? <View className="bg-sf-separator ml-10 h-px" /> : null}
            <SkeletonRow widthPct={w} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Task list placeholder while CalDAV / GitHub data loads. */
export function TaskListSkeleton() {
  return (
    <View className="pb-8">
      <View className="flex-row gap-2 pt-2">
        <ShimmerBlock width={72} height={32} radius={16} />
        <ShimmerBlock width={64} height={32} radius={16} />
        <ShimmerBlock width={80} height={32} radius={16} />
      </View>
      <SkeletonSection rows={['85%', '72%', '58%']} />
      <SkeletonSection rows={['78%', '64%']} />
    </View>
  );
}

/** Kanban / board list placeholder. */
export function BoardListSkeleton() {
  return (
    <View className="gap-4 pb-8 pt-2">
      <View className="flex-row gap-2">
        <ShimmerBlock width={96} height={34} radius={17} />
        <ShimmerBlock width={88} height={34} radius={17} />
        <ShimmerBlock width={72} height={34} radius={17} />
      </View>
      <View className="gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    </View>
  );
}

/** Settings / detail page placeholder. */
export function SettingsSkeleton() {
  return (
    <View className="gap-4 px-1 pt-2">
      <View className="items-center gap-3 py-6">
        <ShimmerBlock width={80} height={80} radius={40} />
        <ShimmerBlock width={140} height={16} radius={8} />
        <ShimmerBlock width={100} height={12} radius={6} />
      </View>
      <View className="gap-2 rounded-3xl p-2">
        {[0, 1, 2].map((i) => (
          <View key={i} className="flex-row items-center gap-3 px-2 py-3">
            <ShimmerBlock width={44} height={44} radius={22} />
            <View className="flex-1 gap-2">
              <ShimmerBlock width="60%" height={14} radius={7} />
              <ShimmerBlock width="40%" height={11} radius={6} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
