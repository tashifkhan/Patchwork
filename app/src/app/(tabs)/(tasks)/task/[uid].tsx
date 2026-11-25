import { useLocalSearchParams } from 'expo-router';

import { TaskDetailView } from '@/features/tasks/task-detail';

export default function TaskDetailScreen() {
  const ref = useLocalSearchParams<{ uid: string; account?: string; list?: string }>();
  return <TaskDetailView {...ref} />;
}
