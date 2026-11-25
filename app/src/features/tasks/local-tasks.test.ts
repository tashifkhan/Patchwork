import { expect, mock, test } from 'bun:test';

test('local checklist deletion saves the entire tree and restore is safe to retry', async () => {
  const storage = new Map<string, string>();
  let rejectBinWrite = false;
  mock.module('@react-native-async-storage/async-storage', () => ({
    default: {
      getItem: async (key: string) => storage.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        if (rejectBinWrite && key === 'patchwork.recycle-bin.v1') throw new Error('Bin write failed');
        storage.set(key, value);
      },
    },
  }));

  const { createLocalList, createLocalTask, getLocalTasks, restoreLocalTaskTree, trashLocalTask } = await import('./local-tasks');
  const { useRecycleBinStore } = await import('@/lib/recycle-bin');
  const { buildTaskTree } = await import('./model');
  const originalBin = useRecycleBinStore.getState();
  useRecycleBinStore.setState({ entries: [], hydrated: false });
  try {
    const list = await createLocalList('Scratch');
    const otherList = await createLocalList('Other');
    const parent = await createLocalTask({ list_id: list.id, title: 'Parent' });
    const child = await createLocalTask({ list_id: list.id, parent_uid: parent.uid, title: 'Child', completed: true });
    const grandchild = await createLocalTask({ list_id: list.id, parent_uid: child.uid, title: 'Grandchild' });
    const unrelated = await createLocalTask({ list_id: otherList.id, title: 'Unrelated' });

    rejectBinWrite = true;
    await expect(trashLocalTask(parent.id)).rejects.toThrow('Bin write failed');
    expect((await getLocalTasks()).map((task) => task.uid)).toEqual([parent.uid, child.uid, grandchild.uid, unrelated.uid]);
    expect(useRecycleBinStore.getState().entries).toEqual([]);

    rejectBinWrite = false;
    await trashLocalTask(parent.id);
    expect((await getLocalTasks()).map((task) => task.uid)).toEqual([unrelated.uid]);
    const [entry] = useRecycleBinStore.getState().entries;
    expect(entry?.task.uid).toBe(parent.uid);
    expect(entry?.checklist?.map((task) => task.uid)).toEqual([child.uid, grandchild.uid]);

    await createLocalTask({ list_id: otherList.id, uid: parent.uid, title: 'Existing UID' });
    await restoreLocalTaskTree(entry!, otherList.id);
    await restoreLocalTaskTree(entry!, otherList.id);
    const tasks = await getLocalTasks();
    expect(tasks).toHaveLength(5);
    const restored = buildTaskTree(tasks).find((task) => task.title === 'Parent');
    expect(restored?.uid).not.toBe(parent.uid);
    expect(restored?.list_id).toBe(otherList.id);
    expect(restored?.children[0]?.completed).toBe(true);
    expect(restored?.children[0]?.children.map((task) => task.uid)).toEqual([grandchild.uid]);
  } finally {
    useRecycleBinStore.setState(originalBin);
  }
});
