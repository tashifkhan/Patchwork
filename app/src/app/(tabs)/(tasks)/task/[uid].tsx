import { useLocalSearchParams } from 'expo-router';

import { TaskDetailView } from '@/components/tasks/task-detail';

export default function TaskDetailScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  return <TaskDetailView uid={uid} />;
}
