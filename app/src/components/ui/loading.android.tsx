import {
  ContainedLoadingIndicator,
  Host,
  LinearWavyProgressIndicator,
  LoadingIndicator,
} from '@expo/ui/jetpack-compose';
import { type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Text, View } from '@/tw';

import type { LoadingBarProps, LoadingStateProps } from './loading';

/**
 * Material 3 expressive loading — Paisa StatementImport style:
 * ContainedLoadingIndicator + title + LinearWavyProgressIndicator.
 * Works full-screen or nested in sheets (fullScreen=false keeps bg transparent).
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
  // Sheet-friendly size when not full screen
  const bubble = fullScreen ? 96 : 80;
  const indicator = fullScreen ? 64 : 52;

  return (
    <View
      className={
        fullScreen
          ? 'flex-1 items-center justify-center px-8'
          : 'w-full items-center justify-center self-center px-6 py-10'
      }
      style={[
        {
          backgroundColor: fullScreen ? colors.bg : 'transparent',
          gap: fullScreen ? 20 : 16,
        },
        style,
      ]}>
      {/* Contained morphing indicator — primaryContainer ring like Paisa */}
      <View
        className="items-center justify-center rounded-full"
        style={{
          width: bubble,
          height: bubble,
          backgroundColor: colors.primaryContainer,
        }}>
        <Host matchContents style={{ width: indicator, height: indicator }}>
          <ContainedLoadingIndicator
            color={colors.onPrimaryContainer}
            containerColor={colors.primaryContainer}
          />
        </Host>
      </View>

      <View className="items-center gap-1.5" style={{ maxWidth: 280 }}>
        {message ? (
          <Text
            className="text-sf-text text-center font-bold"
            style={{ fontSize: fullScreen ? 18 : 16 }}>
            {message}
          </Text>
        ) : null}
        {subtitle ? (
          <Text className="text-sf-text-2 text-center text-sm" style={{ lineHeight: 20 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {bar ? (
        <View
          style={{
            width: '72%',
            maxWidth: 260,
            height: 20,
            alignItems: 'center',
            marginTop: 4,
          }}>
          <Host matchContents style={{ width: '100%', height: 14 }}>
            <LinearWavyProgressIndicator
              progress={null}
              color={colors.accent}
              trackColor={colors.bg3}
            />
          </Host>
        </View>
      ) : null}
    </View>
  );
}

/**
 * M3 LinearWavyProgressIndicator — Paisa budgets / SMS scan progress.
 */
export function LoadingBar({ progress, color, trackColor, style }: LoadingBarProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { width: '100%', height: 16, alignItems: 'center', justifyContent: 'center' },
        style as StyleProp<ViewStyle>,
      ]}>
      <Host matchContents style={{ width: '100%', height: 12 }}>
        <LinearWavyProgressIndicator
          progress={progress ?? null}
          color={color ?? colors.accent}
          trackColor={trackColor ?? colors.bg3}
        />
      </Host>
    </View>
  );
}

/** Compact M3 LoadingIndicator for inline use. */
export function LoadingSpinner({ size = 24 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <Host matchContents style={{ width: size, height: size }}>
      <LoadingIndicator color={colors.accent} />
    </Host>
  );
}
