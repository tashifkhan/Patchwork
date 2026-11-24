import { PillTabs } from './pill-tabs';

export interface SegmentedChoiceOption<T> {
  label: string;
  value: T;
}

interface SegmentedChoiceProps<T> {
  options: SegmentedChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  minHeight?: number;
}

/**
 * Android: Paisa's PillTabs (a sliding filled pill on a tinted track), not
 * outlined segmented buttons. Same API as the iOS/web segmented control.
 */
export function SegmentedChoice<T>({ options, value, onChange, minHeight = 48 }: SegmentedChoiceProps<T>) {
  return <PillTabs options={options} value={value} onChange={onChange} height={Math.max(44, minHeight)} />;
}
