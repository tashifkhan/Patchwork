import { expect, mock, test } from 'bun:test';

const existing = {
  id: 'previous',
  kind: 'task',
  createdAt: '2026-11-24',
  attempts: 0,
  lastError: null,
  listName: 'Tasks',
  payload: { list_id: 'account:tasks', uid: 'previous', title: 'Existing offline task' },
};

test('the queue survives read failures and publishes only persisted writes', async () => {
  let disk = JSON.stringify([existing]);
  let failRead = true;
  let failWrite = false;
  mock.module('@react-native-async-storage/async-storage', () => ({
    default: {
      getItem: async () => {
        if (failRead) throw new Error('read failed');
        return disk;
      },
      setItem: async (_key: string, value: string) => {
        if (failWrite) throw new Error('write failed');
        disk = value;
      },
    },
  }));
  const { enqueue, removeEntries, updateEntry, useOutboxStore, withOutboxEntry } = await import('./outbox');
  useOutboxStore.setState({ entries: [], hydrated: false, loadError: null });
  const entry = {
    kind: 'task' as const,
    listName: 'Tasks',
    payload: { list_id: 'account:tasks', uid: 'new', title: 'New task' },
  };

  await expect(enqueue(entry)).rejects.toThrow('Could not read pending changes');
  expect(useOutboxStore.getState().hydrated).toBe(false);
  expect(JSON.parse(disk)).toEqual([existing]);

  failRead = false;
  failWrite = true;
  await expect(enqueue(entry)).rejects.toThrow('write failed');
  expect(useOutboxStore.getState().entries).toEqual([existing]);

  failWrite = false;
  const saved = await enqueue(entry);
  expect(JSON.parse(disk)).toEqual([existing, saved]);
  expect(useOutboxStore.getState().entries).toEqual([existing, saved]);

  await withOutboxEntry(saved.id, async (_, locked) => {
    await expect(updateEntry(saved.id, (entry) => ({ ...entry, lastError: 'Changed' }))).rejects.toThrow('syncing');
    await expect(removeEntries([existing.id, saved.id])).rejects.toThrow('syncing');
    expect(JSON.parse(disk)).toEqual([existing, saved]);
    await locked.remove();
  });
  expect(JSON.parse(disk)).toEqual([existing]);
});
