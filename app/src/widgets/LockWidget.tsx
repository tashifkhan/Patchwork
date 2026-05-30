import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import { font } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { formatDue } from './shared/format';
import type { LockProps } from './shared/types';

const LockWidgetView = (props: LockProps, env: WidgetEnvironment) => {
  'widget';
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
