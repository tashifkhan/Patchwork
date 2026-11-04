import { Box, Column, getMaterialColors, LazyColumn, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  padding,
  paddingAll,
  size,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { ListProps, WidgetTask } from './shared/types';

// See TodayWidget.android.tsx for why helpers are defined inside the layout function.
const ListWidgetView = (props: ListProps | undefined, _env: WidgetEnvironment) => {
  'widget';
  const c = getMaterialColors();
  const tasks: WidgetTask[] = props?.tasks ?? [];
  const listName = props?.listName || 'Patchwork';

  const formatDue = (dueAt: string | null): string => {
    if (!dueAt) return '';
    const d = new Date(dueAt);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((startOfDue - startOfToday) / 86400000);
    const hasTime = !/T00:00:00/.test(dueAt);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (dayDiff === 0) return hasTime ? `Today, ${time}` : 'Today';
    if (dayDiff === 1) return hasTime ? `Tomorrow, ${time}` : 'Tomorrow';
    if (dayDiff === -1) return 'Yesterday';
    if (dayDiff < 0) return `${-dayDiff} days overdue`;
    if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const taskRow = (task: WidgetTask) => {
    const overdue = task.bucket === 'overdue';
    const due = formatDue(task.due_at);
    return (
      <Column key={task.id} modifiers={[fillMaxWidth(), padding(0, 0, 0, 4)]}>
        <Row
          verticalAlignment="center"
          modifiers={[
            fillMaxWidth(),
            background(c.surfaceContainerHigh),
            cornerRadius(18),
            padding(12, 10, 12, 10),
          ]}>
          <Box
            contentAlignment="center"
            modifiers={[size(18, 18), cornerRadius(9), background(overdue ? c.error : c.outline)]}>
            <Box modifiers={[size(14, 14), cornerRadius(7), background(c.surfaceContainerHigh)]} />
          </Box>
          <Spacer modifiers={[width(12)]} />
          <Column>
            <Text color={c.onSurface} style={{ fontSize: 14 }} maxLines={1}>
              {task.title}
            </Text>
            {due ? (
              <Text
                color={overdue ? c.error : c.onSurfaceVariant}
                style={{ fontSize: 12, fontWeight: overdue ? '500' : '400' }}>
                {due}
              </Text>
            ) : null}
          </Column>
        </Row>
      </Column>
    );
  };

  return (
    <Column
      modifiers={[fillMaxSize(), background(c.surfaceContainer), cornerRadius(28), paddingAll(12)]}>
      <Row verticalAlignment="center" modifiers={[fillMaxWidth(), padding(6, 2, 6, 8)]}>
        <Text color={c.onSurface} style={{ fontSize: 14, fontWeight: '500' }} maxLines={1}>
          {listName}
        </Text>
        {tasks.length > 0 ? (
          <Text color={c.onSurfaceVariant} style={{ fontSize: 12 }}>
            {`  ${tasks.length}`}
          </Text>
        ) : null}
      </Row>
      {tasks.length === 0 ? (
        <Column
          modifiers={[fillMaxWidth(), background(c.surfaceContainerHigh), cornerRadius(18), paddingAll(16)]}>
          <Text color={c.onSurface} style={{ fontSize: 14, fontWeight: '500' }}>
            {props?.listId ? 'All done' : 'No list yet'}
          </Text>
          <Text color={c.onSurfaceVariant} style={{ fontSize: 12 }}>
            {props?.listId ? 'Every task in this list is complete.' : 'Open a list in Patchwork to pin it here.'}
          </Text>
        </Column>
      ) : (
        <LazyColumn modifiers={[fillMaxWidth()]}>{tasks.map(taskRow)}</LazyColumn>
      )}
    </Column>
  );
};

export default createWidget<ListProps>('ListWidget', ListWidgetView, {
  generatedAt: 0,
  listId: null,
  listName: '',
  tasks: [],
});
