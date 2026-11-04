import { Column, getMaterialColors, LazyColumn, Row, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  padding,
  paddingAll,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { UpcomingProps, WidgetTask } from './shared/types';

// See TodayWidget.android.tsx for why helpers are defined inside the layout function.
const UpcomingWidgetView = (props: UpcomingProps | undefined, _env: WidgetEnvironment) => {
  'widget';
  const c = getMaterialColors();

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
    if (dayDiff === 0 || dayDiff === 1) return hasTime ? time : '';
    if (dayDiff === -1) return 'Yesterday';
    if (dayDiff < 0) return `${-dayDiff} days overdue`;
    if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const groups: { label: string; color: string; tasks: WidgetTask[] }[] = [
    { label: 'Overdue', color: c.error, tasks: props?.overdue ?? [] },
    { label: 'Today', color: c.primary, tasks: props?.today ?? [] },
    { label: 'Tomorrow', color: c.secondary, tasks: props?.tomorrow ?? [] },
    { label: 'Later', color: c.tertiary, tasks: props?.upcoming ?? [] },
  ].filter((group) => group.tasks.length > 0);

  const total = groups.reduce((sum, group) => sum + group.tasks.length, 0);

  // LazyColumn wants a flat list of keyed children, so section labels and rows share one array.
  const rows: React.JSX.Element[] = [];
  for (const group of groups) {
    rows.push(
      <Row
        key={`header-${group.label}`}
        verticalAlignment="center"
        modifiers={[fillMaxWidth(), padding(6, rows.length === 0 ? 0 : 8, 6, 4)]}>
        <Text color={group.color} style={{ fontSize: 12, fontWeight: '500' }}>
          {group.label}
        </Text>
        <Text color={c.onSurfaceVariant} style={{ fontSize: 12 }}>
          {`  ${group.tasks.length}`}
        </Text>
      </Row>
    );
    for (const task of group.tasks) {
      const due = formatDue(task.due_at);
      const meta = [due, task.list_name].filter(Boolean).join(' · ');
      rows.push(
        <Column key={`${group.label}-${task.id}`} modifiers={[fillMaxWidth(), padding(0, 0, 0, 4)]}>
          <Column
            modifiers={[
              fillMaxWidth(),
              background(c.surfaceContainerHigh),
              cornerRadius(18),
              padding(14, 10, 14, 10),
            ]}>
            <Text color={c.onSurface} style={{ fontSize: 14 }} maxLines={1}>
              {task.title}
            </Text>
            {meta ? (
              <Text
                color={group.label === 'Overdue' ? c.error : c.onSurfaceVariant}
                style={{ fontSize: 12 }}
                maxLines={1}>
                {meta}
              </Text>
            ) : null}
          </Column>
        </Column>
      );
    }
  }

  return (
    <Column
      modifiers={[fillMaxSize(), background(c.surfaceContainer), cornerRadius(28), paddingAll(12)]}>
      <Row verticalAlignment="center" modifiers={[fillMaxWidth(), padding(6, 2, 6, 8)]}>
        <Text color={c.onSurface} style={{ fontSize: 14, fontWeight: '500' }}>
          Upcoming
        </Text>
        {total > 0 ? (
          <Text color={c.onSurfaceVariant} style={{ fontSize: 12 }}>
            {`  ${total}`}
          </Text>
        ) : null}
      </Row>
      {rows.length === 0 ? (
        <Column
          modifiers={[fillMaxWidth(), background(c.surfaceContainerHigh), cornerRadius(18), paddingAll(16)]}>
          <Text color={c.onSurface} style={{ fontSize: 14, fontWeight: '500' }}>
            You&apos;re all caught up
          </Text>
          <Text color={c.onSurfaceVariant} style={{ fontSize: 12 }}>
            New due dates will show up here.
          </Text>
        </Column>
      ) : (
        <LazyColumn modifiers={[fillMaxWidth()]}>{rows}</LazyColumn>
      )}
    </Column>
  );
};

export default createWidget<UpcomingProps>('UpcomingWidget', UpcomingWidgetView, {
  generatedAt: 0,
  overdue: [],
  today: [],
  tomorrow: [],
  upcoming: [],
});
