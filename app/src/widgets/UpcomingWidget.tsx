import { HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { formatDue } from './shared/format';
import type { UpcomingProps, WidgetTask } from './shared/types';

const UpcomingWidgetView = (props: UpcomingProps, env: WidgetEnvironment) => {
  'widget';
  const tint = env.colorScheme === 'dark' ? '#FFFFFF' : '#0B0B0F';
  const muted = env.colorScheme === 'dark' ? '#9BA1A6' : '#6B7280';
  const accent = '#208AEF';
  const big = env.widgetFamily === 'systemLarge';
  const perBucket = big ? 3 : 2;

  const groups: { label: string; color: string; tasks: WidgetTask[] }[] = [
    { label: 'Overdue', color: '#E5484D', tasks: props.overdue },
    { label: 'Today', color: accent, tasks: props.today },
    { label: 'Tomorrow', color: muted, tasks: props.tomorrow },
  ];
  if (big) groups.push({ label: 'Upcoming', color: muted, tasks: props.upcoming });

  return (
    <VStack modifiers={[padding({ all: 12 })]}>
      {groups
        .filter((g) => g.tasks.length > 0)
        .map((group) => (
          <VStack key={group.label} modifiers={[padding({ top: 6 })]}>
            <Text modifiers={[font({ weight: 'semibold', size: 11 }), foregroundStyle(group.color)]}>
              {group.label.toUpperCase()} · {group.tasks.length}
            </Text>
            {group.tasks.slice(0, perBucket).map((task) => (
              <Link key={task.id} destination={`patchwork:///task/${encodeURIComponent(task.uid)}`}>
                <HStack modifiers={[padding({ top: 2 })]}>
                  <Text modifiers={[font({ size: 12 }), foregroundStyle(tint)]}>{task.title}</Text>
                  <Spacer />
                  <Text modifiers={[font({ size: 10 }), foregroundStyle(muted)]}>
                    {formatDue(task.due_at)}
                  </Text>
                </HStack>
              </Link>
            ))}
          </VStack>
        ))}
      {props.overdue.length + props.today.length + props.tomorrow.length === 0 ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(muted)]}>You&apos;re all caught up.</Text>
      ) : null}
    </VStack>
  );
};

export default createWidget('UpcomingWidget', UpcomingWidgetView);
