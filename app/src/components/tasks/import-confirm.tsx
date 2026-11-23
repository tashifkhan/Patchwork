import { useMemo, useState } from 'react';

import type { TaskList } from '@/api/types';
import { ListPicker } from '@/components/tasks/list-picker';
import { NativeAlert } from '@/components/ui/native-alert';
import { useImportTasks, useTaskLists } from '@/hooks/use-tasks';
import type { ImportPlan } from '@/lib/backup';
import { haptics } from '@/lib/haptics';
import { LOCAL_ACCOUNT_ID } from '@/lib/local-tasks';

/**
 * The last step of every import (file, pasted text, scanned QR): say what
 * will be created, then create it. Lists are matched by name; one that
 * doesn't exist is created in the only CalDAV account, or on this device
 * when there are several (or none). "Pick a list" puts everything in one.
 */
export function useImportConfirm(
  /** After the result message is dismissed. */
  onDone?: (result: { created: number; failed: number }) => void,
  /** The user backed out before anything was imported. */
  onCancel?: () => void
) {
  const listsQuery = useTaskLists();
  const importTasks = useImportTasks();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<{ message: string; outcome: { created: number; failed: number } | null } | null>(null);

  const lists = useMemo(() => (listsQuery.data ?? []).filter((list) => !list.is_deck), [listsQuery.data]);
  const remoteAccounts = [...new Set(lists.map((l) => l.account_id).filter((id) => id && id !== LOCAL_ACCOUNT_ID))];
  const newListAccountId = remoteAccounts.length === 1 ? remoteAccounts[0] : LOCAL_ACCOUNT_ID;
  const newListPlace = remoteAccounts.length === 1 ? lists.find((l) => l.account_id === newListAccountId)?.account_name : 'this device';

  async function run(target?: TaskList) {
    const current = plan;
    setPlan(null);
    if (!current) return;
    try {
      const outcome = await importTasks.mutateAsync({
        plan: current,
        lists,
        newListAccountId,
        intoListId: target?.id,
      });
      haptics.success();
      setResult({
        message: outcome.failed
          ? `Imported ${outcome.created}. ${outcome.failed} could not be saved; check your connection.`
          : `Imported ${outcome.created} to-do${outcome.created === 1 ? '' : 's'}.`,
        outcome,
      });
    } catch (cause) {
      // Usually a list that couldn't be created on the server.
      setResult({ message: cause instanceof Error ? cause.message : 'The import failed.', outcome: null });
    }
  }

  const summary = plan
    ? plan.lists
        .map((group) => {
          const exists = lists.some((l) => l.name.trim().toLowerCase() === group.name.trim().toLowerCase());
          return `${group.name}: ${group.tasks.length}${exists ? '' : ` (new list on ${newListPlace ?? 'this device'})`}`;
        })
        .join('\n')
    : '';

  const element = (
    <>
      <NativeAlert
        visible={plan != null && !picking}
        title={`Import ${plan?.total ?? 0} to-do${plan?.total === 1 ? '' : 's'}?`}
        message={summary}
        confirmLabel="Import"
        dismissLabel="Pick a list"
        onDismiss={() => setPicking(true)}
        onConfirm={() => void run()}
      />
      <ListPicker
        visible={picking}
        lists={lists}
        selectedId={null}
        title="Import into"
        onSelect={(list) => {
          setPicking(false);
          void run(list);
        }}
        onClose={() => {
          setPicking(false);
          setPlan(null);
          onCancel?.();
        }}
      />
      <NativeAlert
        visible={result != null}
        title="Import"
        message={result?.message ?? ''}
        onDismiss={() => {
          const outcome = result?.outcome;
          setResult(null);
          if (outcome) onDone?.(outcome);
          else onCancel?.();
        }}
      />
    </>
  );

  return { confirm: setPlan, busy: importTasks.isPending, element };
}
