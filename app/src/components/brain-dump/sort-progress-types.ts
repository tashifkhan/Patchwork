export type StepState = 'working' | 'done' | 'failed';

export interface SortStep {
  key: string;
  /** Shown while working. */
  label: string;
  /** Shown once done. */
  doneLabel: string;
  /** Shown if it failed. */
  failedLabel: string;
  /** Two or three words for compact layouts (the iOS status capsules), per state. */
  short: { working: string; done: string; failed: string };
  state: StepState;
}

export interface SortProgressProps {
  /** e.g. "Sorting 16 thoughts". */
  title: string;
  steps: SortStep[];
}
