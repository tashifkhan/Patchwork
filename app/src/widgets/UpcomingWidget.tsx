import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  monospacedDigit,
  padding,
  widgetAccentedRenderingMode,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { UpcomingProps, WidgetTask } from './shared/types';

// iOS Upcoming widget, styled after the Things 3 widgets. See TodayWidget.tsx for why
// helpers live inside the layout and how the Liquid Glass background works.
const UpcomingWidgetView = (props: UpcomingProps | undefined, env: WidgetEnvironment) => {
  'widget';
  const family = env.widgetFamily ?? 'systemMedium';
  const accented = env.widgetRenderingMode === 'accented';
  const dark = env.colorScheme === 'dark';

  const card = dark ? '#1C1C1E' : '#FFFFFF';
  const primary = { type: 'hierarchical', style: 'primary' } as const;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const tertiary = { type: 'hierarchical', style: 'tertiary' } as const;
  const red = accented ? primary : '#FF3B30';
  const blue = accented ? primary : '#1A7CF5';

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
    const hasTime = !/T00:00:00/.test(dueAt);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (dayDiff <= 1) return hasTime ? time : '';
    if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const groups = [
    { label: 'Overdue', overdue: true, tasks: props?.overdue ?? [] },
    { label: 'Today', overdue: false, tasks: props?.today ?? [] },
    { label: 'Tomorrow', overdue: false, tasks: props?.tomorrow ?? [] },
    { label: 'Later', overdue: false, tasks: props?.upcoming ?? [] },
  ].filter((group) => group.tasks.length > 0);

  // Fit as many group labels and rows as the family has room for, Things-style.
  let budget = family === 'systemLarge' ? 13 : 5;
  const sections: { label: string; overdue: boolean; tasks: WidgetTask[]; hidden: number }[] = [];
  for (const group of groups) {
    if (budget < 2) break;
    budget -= 1;
    const shown = group.tasks.slice(0, budget);
    budget -= shown.length;
    sections.push({ ...group, tasks: shown, hidden: group.tasks.length - shown.length });
  }

  const row = (task: WidgetTask, overdue: boolean) => {
    const due = formatDue(task.due_at);
    return (
      <Link key={task.id} destination={`patchwork:///task/${encodeURIComponent(task.uid)}`}>
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
      </Link>
    );
  };

  return (
    <VStack alignment="leading" spacing={7} modifiers={[containerBackground(card, 'widget')]}>
      <HStack spacing={6} alignment="center" modifiers={[padding({ bottom: 1 })]}>
        <Image
          systemName="calendar"
          size={14}
          modifiers={[
            font({ size: 14, weight: 'semibold' }),
            foregroundStyle(red),
            widgetAccentedRenderingMode('accented'),
          ]}
        />
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(primary)]}>
          Upcoming
        </Text>
        <Spacer />
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
      </HStack>
      {sections.length === 0 ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>Nothing coming up.</Text>
      ) : (
        sections.map((section) => (
          <VStack key={section.label} alignment="leading" spacing={7}>
            <HStack spacing={4} modifiers={[padding({ top: 2 })]}>
              <Text
                modifiers={[
                  font({ size: 12, weight: 'semibold' }),
                  foregroundStyle(section.overdue ? red : secondary),
                ]}>
                {section.label}
              </Text>
              {section.hidden > 0 ? (
                <Text modifiers={[font({ size: 12 }), foregroundStyle(tertiary)]}>
                  {`+${section.hidden} more`}
                </Text>
              ) : null}
            </HStack>
            {section.tasks.map((task) => row(task, section.overdue))}
          </VStack>
        ))
      )}
      <Spacer />
    </VStack>
  );
};

export default createWidget('UpcomingWidget', UpcomingWidgetView);
