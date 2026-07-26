import type { ReactNode } from 'react';
import type { ColorValue } from 'react-native';

/**
 * Default (iOS / web) header back affordance.
 * Android uses `header-back-button.android.tsx` — a circular Material icon button.
 * iOS keeps the system chevron; this stub is only imported when Platform.OS is
 * not android, and should never render into a header.
 */
export function headerBackButtonLeft(_props: {
  canGoBack?: boolean;
  tintColor?: ColorValue;
  label?: string;
  href?: string;
  backgroundColor?: ColorValue;
}): ReactNode {
  return null;
}
