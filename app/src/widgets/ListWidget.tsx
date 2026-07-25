import { HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import { formatDue } from './shared/format';
import type { ListProps } from './shared/types';

const ListWidgetView = (props: ListProps, env: WidgetEnvironment) => {
  'widget';
  const tint = env.colorScheme === 'dark' ? '#FFFFFF' : '#0B0B0F';
  const muted = env.colorScheme === 'dark' ? '#9BA1A6' : '#6B7280';
  const rows = env.widgetFamily === 'systemSmall' ? 3 : 5;
  const visible = props.tasks.slice(0, rows);

  return (
    <VStack modifiers={[padding({ all: 12 })]}>
      <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(muted)]}>
        {props.listName || 'No list selected'}
      </Text>
      {visible.length === 0 ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(muted), padding({ top: 8 })]}>
          {props.listId ? 'No open tasks.' : 'Open a list in the app to fill this widget.'}
        </Text>
      ) : (
        visible.map((task) => (
          <Link key={task.id} destination={`patchwork:///task/${encodeURIComponent(task.uid)}`}>
            <HStack modifiers={[padding({ top: 4 })]}>
              <Text modifiers={[font({ size: 12 }), foregroundStyle(tint)]}>{task.title}</Text>
              <Spacer />
              <Text modifiers={[font({ size: 10 }), foregroundStyle(muted)]}>
                {formatDue(task.due_at)}
              </Text>
            </HStack>
          </Link>
        ))
      )}
    </VStack>
  );
};

export default createWidget('ListWidget', ListWidgetView);
