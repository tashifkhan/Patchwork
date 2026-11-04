import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import { font } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { LockProps } from './shared/types';

const LockWidgetView = (props: LockProps, env: WidgetEnvironment) => {
  'widget';
  // Defined inside the layout: expo-widgets serializes only this function's body.
  const formatDue = (dueAt: string | null): string => {
    if (!dueAt) return '';
    const d = new Date(dueAt);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((startOfDue - startOfToday) / 86400000);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const hasTime = !/T00:00:00/.test(dueAt);
    if (dayDiff === 0) return hasTime ? time : 'Today';
    if (dayDiff === 1) return hasTime ? `Tom ${time}` : 'Tomorrow';
    if (dayDiff === -1) return 'Yesterday';
    if (dayDiff < 0) return `${-dayDiff}d ago`;
    if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  if (env.widgetFamily === 'accessoryCircular') {
    return (
      <VStack>
        <Text modifiers={[font({ weight: 'bold', size: 18 })]}>{props.totalToday}</Text>
        <Text modifiers={[font({ size: 9 })]}>today</Text>
      </VStack>
    );
  }
  if (env.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack>
        <Text modifiers={[font({ weight: 'semibold', size: 13 })]}>
          {props.nextTitle ?? 'No upcoming tasks'}
        </Text>
        {props.nextDueAt ? (
          <Text modifiers={[font({ size: 11 })]}>{formatDue(props.nextDueAt)}</Text>
        ) : null}
      </VStack>
    );
  }
  // accessoryInline
  return (
    <HStack>
      <Text>
        {props.totalToday} today
        {props.totalOverdue > 0 ? ` · ${props.totalOverdue} overdue` : ''}
      </Text>
    </HStack>
  );
};

export default createWidget('LockWidget', LockWidgetView);
