import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { SFSymbol } from 'expo-symbols';
import type { ComponentProps } from 'react';

import type { ThemeColors } from '@/lib/theme';

export type StatusTone = 'error' | 'warning' | 'info';

export interface StatusAction {
  label: string;
  onPress: () => void;
  /** Shows a spinner and blocks repeat taps. */
  busy?: boolean;
}

export interface StatusBannerProps {
  tone: StatusTone;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  sf: SFSymbol;
  title: string;
  body: string;
  /** Raw error text behind a "Details" toggle. */
  detail?: string | null;
  primary?: StatusAction;
  secondary?: StatusAction;
  /** Shows a close button. */
  onDismiss?: () => void;
}

export function toneColor(colors: ThemeColors, tone: StatusTone) {
  return tone === 'error' ? colors.red : tone === 'warning' ? colors.orange : colors.accent;
}
