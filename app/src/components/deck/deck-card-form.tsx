import type { DeckStack } from '@/api/types';
import { TaskForm, type TaskFormValues } from '@/components/tasks/task-form';

export interface DeckCardFormValues {
  title: string;
  description: string;
  stack_id: number;
  duedate: string | null;
}

interface DeckCardFormProps {
  stacks: DeckStack[];
  initial?: Partial<DeckCardFormValues>;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: DeckCardFormValues) => void;
  onDelete?: () => void;
}

export function DeckCardForm({ stacks, initial, submitting, submitLabel, onSubmit, onDelete }: DeckCardFormProps) {
  const lists = stacks.flatMap((stack) => {
    const id = stack.id;
    if (typeof id !== 'number') return [];
    return [{ id: String(id), href: '', name: stack.title ?? 'Stack', is_deck: true }];
  });

  function handleSubmit(values: TaskFormValues) {
    onSubmit({
      title: values.title,
      description: values.markdown,
      stack_id: Number(values.list_id),
      duedate: values.due_at,
    });
  }

  return (
    <TaskForm
      initial={{
        title: initial?.title ?? '',
        markdown: initial?.description ?? '',
        list_id: String(initial?.stack_id ?? lists[0]?.id ?? ''),
        due_at: initial?.duedate ?? null,
      }}
      lists={lists}
      submitting={submitting}
      submitLabel={submitLabel}
      listLabel="Stack"
      notesLabel="Description"
      showTags={false}
      showReminder={false}
      showPriority={false}
      onSubmit={handleSubmit}
      onDelete={onDelete}
    />
  );
}
