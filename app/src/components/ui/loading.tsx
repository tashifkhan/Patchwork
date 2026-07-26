import { ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Text, View } from '@/tw';

export interface LoadingStateProps {
  /** Primary status line (e.g. "Loading boards…"). */
  message?: string;
  /** Secondary helper line under the title. */
  subtitle?: string;
  /** Fills the parent and centers content. Default true. */
  fullScreen?: boolean;
  /** Show a linear progress track under the spinner. Default true on fullScreen. */
  showBar?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Cross-platform loading state. Android swaps in the M3 morphing
 * `LoadingIndicator` (see `loading.android.tsx`) — same pattern as Paisa.
 */
export function LoadingState({
  message = 'Loading…',
  subtitle,
  fullScreen = true,
  showBar,
  style,
}: LoadingStateProps) {
  const { colors } = useTheme();
  const bar = showBar ?? fullScreen;

  return (
    <View
      className={
        fullScreen
          ? 'flex-1 items-center justify-center px-8'
          : 'items-center justify-center px-6 py-12'
      }
      style={[
        {
          backgroundColor: fullScreen ? colors.bg : 'transparent',
          gap: 20,
        },
        style,
      ]}>
      <View
        className="h-20 w-20 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.primaryContainer }}>
        <ActivityIndicator size="large" color={colors.onPrimaryContainer} />
      </View>
      <View className="items-center gap-1.5" style={{ maxWidth: 280 }}>
        {message ? (
          <Text className="text-sf-text text-center text-lg font-bold">{message}</Text>
        ) : null}
        {subtitle ? (
          <Text className="text-sf-text-2 text-center text-sm" style={{ lineHeight: 20 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {bar ? (
        <View style={{ width: '70%', maxWidth: 240, marginTop: 4 }}>
          <LoadingBar />
        </View>
      ) : null}
    </View>
  );
}

export interface LoadingBarProps {
  /** 0–1 for determinate; omit for indeterminate. */
  progress?: number | null;
  color?: string;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Thin top-of-screen / inline progress bar. Android uses M3
 * `LinearWavyProgressIndicator` (Paisa budgets / SMS style).
 */
export function LoadingBar({ progress, color, trackColor, style }: LoadingBarProps) {
  const { colors } = useTheme();
  const barColor = color ?? colors.accent;
  const track = trackColor ?? colors.bg3;
  const pct = progress == null ? null : Math.max(0, Math.min(1, progress));

  return (
    <View
      style={[
        {
          height: 6,
          borderRadius: 3,
          backgroundColor: track,
          overflow: 'hidden',
          width: '100%',
        },
        style,
      ]}>
      <View
        style={{
          height: '100%',
          width: pct == null ? '40%' : `${pct * 100}%`,
          backgroundColor: barColor,
          borderRadius: 3,
          opacity: pct == null ? 0.9 : 1,
        }}
      />
    </View>
  );
}

/** Compact inline spinner for buttons / list footers. */
export function LoadingSpinner({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();
  return <ActivityIndicator size={size < 28 ? 'small' : 'large'} color={colors.accent} />;
}
