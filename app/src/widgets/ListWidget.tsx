import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  padding,
  widgetAccentedRenderingMode,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { ListProps, WidgetTask } from './shared/types';

// iOS List widget, styled after the Things 3 widgets. See TodayWidget.tsx for why
// helpers live inside the layout and how the Liquid Glass background works.
const ListWidgetView = (props: ListProps | undefined, env: WidgetEnvironment) => {
  'widget';
  const tasks: WidgetTask[] = props?.tasks ?? [];
  const family = env.widgetFamily ?? 'systemMedium';
  const accented = env.widgetRenderingMode === 'accented';
  const dark = env.colorScheme === 'dark';

  const card = dark ? '#1C1C1E' : '#FFFFFF';
  const primary = { type: 'hierarchical', style: 'primary' } as const;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const tertiary = { type: 'hierarchical', style: 'tertiary' } as const;
  const red = accented ? primary : '#FF3B30';
  const blue = accented ? primary : '#1A7CF5';

  const isSmall = family === 'systemSmall';
  const visible = tasks.slice(0, isSmall ? 3 : 4);
  const remaining = Math.max(0, tasks.length - visible.length);

  const formatDue = (dueAt: string | null): string => {
    if (!dueAt) return '';
    const d = new Date(dueAt);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDiff = Math.round((startOfDue - startOfToday) / 86400000);
    if (dayDiff < -1) return `${-dayDiff}d ago`;
    if (dayDiff === -1) return 'Yesterday';
    if (dayDiff === 0) return 'Today';
    if (dayDiff === 1) return 'Tomorrow';
    if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const row = (task: WidgetTask) => {
    const overdue = task.bucket === 'overdue';
    const due = isSmall ? '' : formatDue(task.due_at);
    const content = (
      <HStack spacing={8} alignment="center">
        <Image systemName="square" size={16} modifiers={[foregroundStyle(tertiary)]} />
        <Text modifiers={[font({ size: 14 }), foregroundStyle(primary), lineLimit(1)]}>
          {task.title}
        </Text>
        <Spacer />
        {due ? (
          <HStack spacing={3} alignment="center">
            {overdue ? (
              <Image systemName="flag.fill" size={9} modifiers={[foregroundStyle(red)]} />
            ) : null}
            <Text
              modifiers={[font({ size: 12 }), monospacedDigit(), foregroundStyle(overdue ? red : secondary)]}>
              {due}
            </Text>
          </HStack>
        ) : null}
      </HStack>
    );
    if (isSmall) return <HStack key={task.id}>{content}</HStack>;
    return (
      <Link key={task.id} destination={`patchwork:///task/${encodeURIComponent(task.uid)}`}>
        {content}
      </Link>
    );
  };

  return (
    <VStack
      alignment="leading"
      spacing={isSmall ? 7 : 8}
      modifiers={[
        containerBackground(card, 'widget'),
        ...(isSmall ? [widgetURL('patchwork:///')] : []),
      ]}>
      <HStack spacing={6} alignment="center" modifiers={[padding({ bottom: 2 })]}>
        <Image
          systemName="list.bullet.circle.fill"
          size={15}
          modifiers={[foregroundStyle(blue), widgetAccentedRenderingMode('accented')]}
        />
        <Text
          modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(primary), lineLimit(1)]}>
          {props?.listName || 'Patchwork'}
        </Text>
        <Spacer />
        {isSmall ? null : (
          <Link destination="patchwork:///new-task">
            <Image
              systemName="plus"
              size={15}
              modifiers={[
                font({ size: 15, weight: 'semibold' }),
                foregroundStyle(blue),
                widgetAccentedRenderingMode('accented'),
              ]}
            />
          </Link>
        )}
      </HStack>
      {visible.length === 0 ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>
          {props?.listId ? 'No open to-dos.' : 'Open a list in Patchwork to show it here.'}
        </Text>
      ) : (
        visible.map(row)
      )}
      {remaining > 0 ? (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(tertiary), padding({ leading: 24 })]}>
          {`+${remaining} more`}
        </Text>
      ) : null}
      <Spacer />
    </VStack>
  );
};

export default createWidget('ListWidget', ListWidgetView);
