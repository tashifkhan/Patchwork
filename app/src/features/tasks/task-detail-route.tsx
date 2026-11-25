import { useLocalSearchParams } from 'expo-router';

import { TaskDetailView } from './task-detail';

export function TaskDetailRoute() {
  const ref = useLocalSearchParams<{ uid: string; account?: string; list?: string }>();
  return <TaskDetailView {...ref} />;
}
