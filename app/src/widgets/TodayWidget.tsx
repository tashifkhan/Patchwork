import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { formatDue } from './shared/format';
import type { TodayProps, WidgetTask } from './shared/types';

function rowCountFor(family: WidgetEnvironment['widgetFamily']): number {
  if (family === 'systemSmall') return 2;
  if (family === 'systemMedium') return 3;
  return 6;
}

const TodayWidgetView = (props: TodayProps, env: WidgetEnvironment) => {
  'widget';
  const tint = env.colorScheme === 'dark' ? '#FFFFFF' : '#0B0B0F';
  const muted = env.colorScheme === 'dark' ? '#9BA1A6' : '#6B7280';
  const visible = props.tasks.slice(0, rowCountFor(env.widgetFamily));
  const remaining = Math.max(0, props.totalToday - visible.length);

  return (
    <VStack modifiers={[padding({ all: 12 })]}>
      <HStack>
        <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(muted)]}>
          {props.totalOverdue > 0 ? `${props.totalOverdue} overdue · Today` : 'Today'}
        </Text>
        <Spacer />
        <Text modifiers={[font({ weight: 'bold', size: 18 }), foregroundStyle(tint)]}>
          {props.totalToday}
        </Text>
      </HStack>
      {visible.length === 0 ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(muted), padding({ top: 8 })]}>
          Nothing due today.
        </Text>
      ) : (
        visible.map((task) => <TaskRow key={task.id} task={task} tint={tint} muted={muted} />)
      )}
      {remaining > 0 ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), padding({ top: 4 })]}>
          +{remaining} more
        </Text>
      ) : null}
    </VStack>
  );
};

function TaskRow({ task, tint, muted }: { task: WidgetTask; tint: string; muted: string }) {
  'widget';
  const due = formatDue(task.due_at);
  return (
    <HStack modifiers={[padding({ top: 6 })]}>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(tint)]}>{task.title}</Text>
      <Spacer />
      {due ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>{due}</Text>
      ) : null}
    </HStack>
  );
}

export default createWidget('TodayWidget', TodayWidgetView);
