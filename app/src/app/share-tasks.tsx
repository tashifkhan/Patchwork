import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Share } from 'react-native';

import { Button } from '@/components/ui/button';
import { QrCode } from '@/components/ui/qr-code';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useTaskLists, useTasks } from '@/hooks/use-tasks';
import { haptics } from '@/lib/haptics';
import { flattenTasks } from '@/lib/task-buckets';
import { listToKaruiFrames } from '@/lib/karui-qr';
import { listsToMarkdown } from '@/lib/task-text';
import type { Task } from '@/api/types';
import { ScrollView, Text, View } from '@/tw';

/**
 * Share a list (`?listId=`) or one to-do (`?uid=`) as a QR code another
 * phone can scan into Patchwork or Karui, or as plain Markdown text.
 * Open to-dos only by default, which keeps the code small enough to scan.
 */
export default function ShareTasksScreen() {
  const params = useLocalSearchParams<{ listId?: string; uid?: string }>();
  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const [includeDone, setIncludeDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const { name, text, frames, count } = useMemo(() => {
    const all = tasksQuery.data ?? [];
    let name = 'List';
    let tasks: Task[] = [];
    if (params.uid) {
      const task = flattenTasks(all).find((t) => t.uid === params.uid);
      if (task) {
        name = task.list_name;
        tasks = [task];
      }
    } else {
      name = listsQuery.data?.find((l) => l.id === params.listId)?.name ?? 'List';
      tasks = all.filter((t) => t.list_id === params.listId && (includeDone || !t.completed));
    }
    if (!tasks.length) return { name, text: '', frames: [] as string[], count: 0 };
    return {
      name: params.uid ? tasks[0].title : name,
      text: listsToMarkdown([{ name, tasks }]),
      // The QR speaks Karui's format, so either app can scan it.
      frames: listToKaruiFrames(name, tasks),
      count: flattenTasks(tasks).length,
    };
  }, [includeDone, listsQuery.data, params.listId, params.uid, tasksQuery.data]);

  // Long lists span several codes, shown in a loop like Karui does.
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (frames.length < 2) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % frames.length), 900);
    return () => clearInterval(timer);
  }, [frames.length]);
  const shown = frames[frame % Math.max(1, frames.length)] ?? '';

  return (
    <SheetSurface title={`Share ${name}`} subtitle="Scan it with Patchwork or Karui on another phone">
      <Stack.Screen options={{ title: 'Share' }} />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}>
        {shown ? (
          <QrCode value={shown} />
        ) : (
          <Text className="text-sf-text-2 py-10 text-center">Nothing to share yet.</Text>
        )}
        <Text className="text-sf-text-3 text-xs">
          {count} to-do{count === 1 ? '' : 's'}
          {frames.length > 1 ? ` · code ${(frame % frames.length) + 1} of ${frames.length}, keep the scanner on it` : ''}
        </Text>
        <View style={{ alignSelf: 'stretch', gap: 12 }}>
          {!params.uid ? (
            <Button
              variant="text"
              label={includeDone ? 'Leave out completed' : 'Include completed'}
              onPress={() => setIncludeDone((value) => !value)}
            />
          ) : null}
          <Button
            label="Share as text"
            icon="share-variant-outline"
            disabled={!text}
            onPress={() => void Share.share({ message: text, title: name })}
          />
          <Button
            variant="tonal"
            label={copied ? 'Copied' : 'Copy as Markdown'}
            icon="content-copy"
            disabled={!text}
            onPress={async () => {
              const Clipboard = await import('expo-clipboard');
              await Clipboard.setStringAsync(text);
              haptics.success();
              setCopied(true);
            }}
          />
        </View>
      </ScrollView>
    </SheetSurface>
  );
}
