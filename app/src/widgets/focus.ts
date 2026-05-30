import { Platform } from 'react-native';

import { after } from 'expo-widgets';

import { useFocusStore } from '@/stores/focus-store';

import FocusActivity from './FocusActivity';
import type { FocusActivityProps } from './FocusActivity';

const isIOS = Platform.OS === 'ios';

let ticker: ReturnType<typeof setInterval> | null = null;

function stopTicker() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function currentProps(): FocusActivityProps | null {
  const { taskTitle, startedAt, durationSeconds, paused, taskUid } = useFocusStore.getState();
  if (!taskUid || !startedAt) return null;
  return { taskTitle, startedAt, durationSeconds, paused };
}

function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    const state = useFocusStore.getState();
    if (!state.instance || !state.startedAt || state.paused) return;
    const remaining = state.durationSeconds - Math.floor((Date.now() - state.startedAt) / 1000);
    if (remaining <= 0) {
      endFocus().catch(() => {});
      return;
    }
    const props = currentProps();
    if (props) state.instance.update(props).catch(() => {});
  }, 30_000);
}

export async function startFocus(taskUid: string, taskTitle: string, durationSeconds: number) {
  if (!isIOS) return;
  await endFocus();
  const startedAt = Date.now();
  const props: FocusActivityProps = { taskTitle, startedAt, durationSeconds, paused: false };
  const instance = FocusActivity.start(props, `todo://task/${encodeURIComponent(taskUid)}`);
  useFocusStore.getState().set({
    taskUid,
    taskTitle,
    startedAt,
    durationSeconds,
    paused: false,
    instance,
  });
  startTicker();
}

export async function pauseFocus() {
  if (!isIOS) return;
  useFocusStore.getState().set({ paused: true });
  const props = currentProps();
  const { instance } = useFocusStore.getState();
  if (instance && props) await instance.update(props).catch(() => {});
}

export async function resumeFocus() {
  if (!isIOS) return;
  useFocusStore.getState().set({ paused: false });
  const props = currentProps();
  const { instance } = useFocusStore.getState();
  if (instance && props) await instance.update(props).catch(() => {});
}

export async function endFocus() {
  if (!isIOS) return;
  stopTicker();
  const { instance } = useFocusStore.getState();
  const props = currentProps();
  if (instance && props) {
    await instance
      .end(after(new Date(Date.now() + 30_000)), props, new Date())
      .catch(() => {});
  }
  useFocusStore.getState().reset();
}
