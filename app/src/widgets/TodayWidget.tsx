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

import type { TodayProps, WidgetTask } from './shared/types';

// iOS Today widget, styled after the Things 3 widgets.
// expo-widgets serializes only this function's body into the widget extension, so every
// helper and constant lives inside it.
//
// Liquid Glass: the card color goes through `containerBackground(_, 'widget')`, which iOS
// swaps for glass on Clear and Tinted Home Screens. Text uses hierarchical styles so the
// system can restyle it, and fixed colors are dropped in the accented rendering mode.
const TodayWidgetView = (props: TodayProps | undefined, env: WidgetEnvironment) => {
  'widget';
  const tasks: WidgetTask[] = props?.tasks ?? [];
  const totalOverdue = props?.totalOverdue ?? 0;
  const total = (props?.totalToday ?? 0) + totalOverdue;
  const family = env.widgetFamily ?? 'systemMedium';
  const accented = env.widgetRenderingMode === 'accented';
  const dark = env.colorScheme === 'dark';

  const card = dark ? '#1C1C1E' : '#FFFFFF';
  const primary = { type: 'hierarchical', style: 'primary' } as const;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const tertiary = { type: 'hierarchical', style: 'tertiary' } as const;
  const red = accented ? primary : '#FF3B30';
  const blue = accented ? primary : '#1A7CF5';
  const yellow = accented ? primary : '#FFC107';

  const isSmall = family === 'systemSmall';
  const rowLimit = isSmall ? 3 : family === 'systemMedium' ? 4 : 11;
  const visible = tasks.slice(0, rowLimit);
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
    if (/T00:00:00/.test(dueAt)) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
          systemName="star.fill"
          size={14}
          modifiers={[foregroundStyle(yellow), widgetAccentedRenderingMode('accented')]}
        />
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(primary)]}>
          Today
        </Text>
        <Spacer />
        {isSmall ? (
          <Text modifiers={[font({ size: 13, weight: 'medium' }), monospacedDigit(), foregroundStyle(secondary)]}>
            {total > 0 ? String(total) : ''}
          </Text>
        ) : (
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
        <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>Nothing due today.</Text>
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

export default createWidget('TodayWidget', TodayWidgetView);
