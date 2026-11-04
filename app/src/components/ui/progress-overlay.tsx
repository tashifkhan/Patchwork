import { StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { DURATION } from '@/lib/motion';

import { ProgressStatus, type ProgressStatusProps } from './progress-status';

/**
 * Covers its parent while something is working (AI drafting, importing) and
 * shows the check when it finishes. It blocks touches so nothing underneath
 * changes mid-request.
 */
export function ProgressOverlay({
  visible,
  state,
  label,
}: { visible: boolean } & Pick<ProgressStatusProps, 'state' | 'label'>) {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.short4)}
      exiting={FadeOut.duration(DURATION.medium1)}
      accessibilityLiveRegion="polite"
      accessibilityLabel={label}
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: 50,
          alignItems: 'center',
          justifyContent: 'center',
          // Alpha in the color, not `opacity`: the fade animation owns opacity.
          backgroundColor: `${colors.bg}F5`,
        },
      ]}>
      <ProgressStatus state={state} label={label} />
    </Animated.View>
  );
}
