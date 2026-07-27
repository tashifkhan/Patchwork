import { beforeEach, describe, expect, test } from 'bun:test';

import { useTagPickerStore } from './tag-picker-store';

const store = () => useTagPickerStore.getState();

function openWithRecorder(available: string[], selected: string[]) {
  const applied: string[][] = [];
  const onApply = (tags: string[]) => applied.push(tags);
  store().open(available, selected, onApply);
  return { applied, onApply };
}

beforeEach(() => {
  useTagPickerStore.setState({ available: [], selected: [], onApply: null });
});

describe('tag picker store', () => {
  test('normalizes the pool it is opened with', () => {
    openWithRecorder([' Work ', 'work', 'home'], ['HOME', 'home']);
    expect(store().available).toEqual(['Work', 'home']);
    expect(store().selected).toEqual(['HOME']);
  });

  test('toggling reports the new selection to the form', () => {
    const { applied } = openWithRecorder(['work', 'home'], []);
    store().toggle('work');
    expect(store().selected).toEqual(['work']);
    store().toggle('work');
    expect(store().selected).toEqual([]);
    expect(applied).toEqual([['work'], []]);
  });

  test('toggling off matches ignoring case', () => {
    openWithRecorder(['Work'], ['Work']);
    store().toggle('work');
    expect(store().selected).toEqual([]);
  });

  test('adding a tag reuses an existing spelling instead of duplicating it', () => {
    const { applied } = openWithRecorder(['Work'], []);
    store().addTag('  work ');
    expect(store().available).toEqual(['Work']);
    expect(store().selected).toEqual(['Work']);
    expect(applied).toEqual([['Work']]);
  });

  test('adding an already-selected tag is a no-op', () => {
    openWithRecorder(['Work'], ['Work']);
    store().addTag('WORK');
    expect(store().selected).toEqual(['Work']);
  });

  test('blank input adds nothing', () => {
    openWithRecorder([], []);
    store().addTag('   ');
    expect(store().available).toEqual([]);
  });

  test('release clears the bridge for the owner that opened it', () => {
    const { onApply } = openWithRecorder(['work'], ['work']);
    store().release(onApply);
    expect(store().onApply).toBeNull();
    expect(store().available).toEqual([]);
    expect(store().selected).toEqual([]);
  });

  test('a stale picker cannot clear a newer one', () => {
    const first = openWithRecorder(['work'], []);
    const second = openWithRecorder(['home'], ['home']);
    // The first picker unmounts after the second has already opened.
    store().release(first.onApply);
    expect(store().onApply).toBe(second.onApply);
    expect(store().selected).toEqual(['home']);
  });
});
