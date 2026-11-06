import type { StyleProp, ViewStyle } from 'react-native';

export interface SystemEmptyStateProps {
  /** SF Symbol name. */
  symbol: string;
  title: string;
  description?: string;
  actions?: { label: string; onPress: () => void }[];
  style?: StyleProp<ViewStyle>;
}

/** iOS only (SwiftUI ContentUnavailableView); other platforms draw their own. */
export function SystemEmptyState(_props: SystemEmptyStateProps): null {
  return null;
}
