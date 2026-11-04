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

import type { TodayProps, WidgetTask } from './shared/types';

// Android widget layout in the style of Google's Material 3 widgets.
// expo-widgets serializes only this function's source and evaluates it in the widget
// runtime, where `@expo/ui/jetpack-compose` exports are globals. Anything declared
// outside the function is missing at runtime, so every helper lives inside it.
const TodayWidgetView = (props: TodayProps | undefined, _env: WidgetEnvironment) => {
  'widget';
  const c = getMaterialColors();
  const tasks: WidgetTask[] = props?.tasks ?? [];
  const totalOverdue = props?.totalOverdue ?? 0;
  const total = (props?.totalToday ?? 0) + totalOverdue;

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
    if (dayDiff === 0) return hasTime ? time : '';
    if (dayDiff === -1) return 'Yesterday';
    if (dayDiff < 0) return `${-dayDiff} days overdue`;
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
        <Text color={c.onSurface} style={{ fontSize: 14, fontWeight: '500' }}>
          Today
        </Text>
        {total > 0 ? (
          <Row verticalAlignment="center">
            <Spacer modifiers={[width(6)]} />
            <Box
              contentAlignment="center"
              modifiers={[background(c.primary), cornerRadius(8), padding(6, 0, 6, 0)]}>
              <Text color={c.onPrimary} style={{ fontSize: 11, fontWeight: '500' }}>
                {String(total)}
              </Text>
            </Box>
          </Row>
        ) : null}
        {totalOverdue > 0 ? (
          <Text color={c.error} style={{ fontSize: 11, fontWeight: '500' }}>
            {`   ${totalOverdue} overdue`}
          </Text>
        ) : null}
      </Row>
      {tasks.length === 0 ? (
        <Column
          modifiers={[fillMaxWidth(), background(c.surfaceContainerHigh), cornerRadius(18), paddingAll(16)]}>
          <Text color={c.onSurface} style={{ fontSize: 14, fontWeight: '500' }}>
            All clear
          </Text>
          <Text color={c.onSurfaceVariant} style={{ fontSize: 12 }}>
            Nothing due today.
          </Text>
        </Column>
      ) : (
        <LazyColumn modifiers={[fillMaxWidth()]}>{tasks.map(taskRow)}</LazyColumn>
      )}
    </Column>
  );
};

export default createWidget<TodayProps>('TodayWidget', TodayWidgetView, {
  generatedAt: 0,
  tasks: [],
  totalToday: 0,
  totalOverdue: 0,
});
