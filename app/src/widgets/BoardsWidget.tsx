import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { BoardsProps, WidgetBoardCard, WidgetBoardColumn } from './shared/types';

// iOS Boards widget: the last opened Deck or Jira board, one tile per column. No title row,
// so the columns get the whole widget; tapping it opens the board.
// See TodayWidget.tsx for why helpers live inside the layout function.
//
// Liquid Glass: the root card goes through `containerBackground(_, 'widget')`, which iOS
// replaces with glass on Clear and Tinted Home Screens. Column tiles use the translucent
// `quinary` fill instead of a solid color, so the glass shows through them, and every
// text color is hierarchical so the system can restyle it in the accented mode.
const BoardsWidgetView = (props: BoardsProps | undefined, env: WidgetEnvironment) => {
  'widget';
  const family = env.widgetFamily ?? 'systemMedium';
  const accented = env.widgetRenderingMode === 'accented';
  const dark = env.colorScheme === 'dark';

  const card = dark ? '#1C1C1E' : '#FFFFFF';
  const primary = { type: 'hierarchical', style: 'primary' } as const;
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  const tertiary = { type: 'hierarchical', style: 'tertiary' } as const;
  const tileFill = { type: 'hierarchical', style: 'quinary' } as const;
  const chipFill = { type: 'hierarchical', style: 'quaternary' } as const;
  const red = accented ? primary : '#FF3B30';

  const columns: WidgetBoardColumn[] = props?.columns ?? [];
  const isSmall = family === 'systemSmall';
  const isLarge = family === 'systemLarge' || family === 'systemExtraLarge';
  const boardUrl = props?.url ?? 'patchwork:///deck';

  const countChip = (count: number) => (
    <Text
      modifiers={[
        font({ size: 11, weight: 'semibold' }),
        monospacedDigit(),
        foregroundStyle(secondary),
        padding({ horizontal: 6, vertical: 1 }),
        background(chipFill),
        clipShape('capsule'),
      ]}>
      {String(count)}
    </Text>
  );

  // Jira issue types get Jira's own symbol and color; Deck cards have no type.
  const typeIcon = (type: string | null | undefined) => {
    const name = (type ?? '').toLowerCase();
    if (!name) return null;
    if (name.includes('bug')) return { symbol: 'ladybug.fill', color: '#E5493A' };
    if (name.includes('story')) return { symbol: 'bookmark.fill', color: '#63BA3C' };
    if (name.includes('epic')) return { symbol: 'bolt.fill', color: '#904EE2' };
    if (name.includes('sub')) return { symbol: 'square.split.2x1.fill', color: '#4BADE8' };
    return { symbol: 'checkmark.square.fill', color: '#4BADE8' };
  };

  // Narrow tiles (medium) skip the priority arrow so the title keeps its room.
  const cardRow = (item: WidgetBoardCard, roomy: boolean) => {
    const icon = typeIcon(item.type);
    const urgent = roomy && /^(highest|high|critical|blocker)$/i.test(item.priority ?? '');
    // An overdue Jira issue tints its type icon red instead of adding a separate flag.
    const iconColor = item.overdue ? red : accented ? secondary : icon?.color ?? secondary;
    return (
      <Link key={item.id} destination={item.url}>
        <HStack spacing={4} alignment="center">
          {icon ? (
            <Image systemName={icon.symbol} size={9} modifiers={[foregroundStyle(iconColor)]} />
          ) : null}
          {item.overdue && !icon ? <Image systemName="flag.fill" size={8} modifiers={[foregroundStyle(red)]} /> : null}
          <Text modifiers={[font({ size: 12 }), foregroundStyle(primary), lineLimit(1)]}>{item.title}</Text>
          <Spacer />
          {urgent ? <Image systemName="arrow.up" size={8} modifiers={[foregroundStyle(red)]} /> : null}
        </HStack>
      </Link>
    );
  };

  const tile = (column: WidgetBoardColumn, cardLimit: number) => {
    const shown = column.cards.slice(0, cardLimit);
    const hidden = column.count - shown.length;
    return (
      <VStack
        key={column.id}
        alignment="leading"
        spacing={5}
        modifiers={[
          padding({ all: 9 }),
          frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' }),
          background(tileFill),
          clipShape('roundedRectangle', 14),
        ]}>
        <HStack spacing={4} alignment="center">
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(1)]}>
            {column.title}
          </Text>
          <Spacer />
          {countChip(column.count)}
        </HStack>
        {shown.length === 0 ? (
          <Text modifiers={[font({ size: 12 }), foregroundStyle(tertiary)]}>Empty</Text>
        ) : (
          shown.map((card) => cardRow(card, cardLimit > 3))
        )}
        {hidden > 0 ? (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(tertiary)]}>{`+${hidden} more`}</Text>
        ) : null}
        <Spacer />
      </VStack>
    );
  };

  // One small line naming the board, so the widget says which board it is without a header row.
  const footer = props?.boardRef ? (
    <HStack spacing={4} alignment="center">
      <Image
        systemName={props.source === 'jira' ? 'square.stack.3d.up.fill' : 'rectangle.split.3x1.fill'}
        size={9}
        modifiers={[foregroundStyle(tertiary)]}
      />
      <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(tertiary), lineLimit(1)]}>
        {props.sprintName ? `${props.title || 'Board'} · ${props.sprintName}` : props.title || 'Board'}
      </Text>
      <Spacer />
      <Text modifiers={[font({ size: 11 }), monospacedDigit(), foregroundStyle(tertiary)]}>
        {props.sprintTiming || `${props.totalCards} ${props.totalCards === 1 ? 'card' : 'cards'}`}
      </Text>
    </HStack>
  ) : null;

  const emptyText = (message: string) => (
    <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary)]}>{message}</Text>
  );

  let body;
  if (!props?.boardRef) {
    body = emptyText('Open a board in Patchwork to pin it here.');
  } else if (columns.length === 0) {
    body = emptyText('This board has no columns yet.');
  } else if (isSmall) {
    // Small: column names with their card counts, the whole widget opens the board.
    body = (
      <VStack alignment="leading" spacing={6}>
        {columns.slice(0, 5).map((column) => (
          <HStack key={column.id} spacing={6} alignment="center">
            <Text modifiers={[font({ size: 13 }), foregroundStyle(primary), lineLimit(1)]}>{column.title}</Text>
            <Spacer />
            {countChip(column.count)}
          </HStack>
        ))}
      </VStack>
    );
  } else if (isLarge) {
    // Large: a 2 by 2 grid of the first four columns.
    const top = columns.slice(0, 2);
    const bottom = columns.slice(2, 4);
    const extra = columns.length - 4;
    body = (
      <VStack alignment="leading" spacing={8}>
        <HStack spacing={8} alignment="top">
          {top.map((column) => tile(column, 5))}
        </HStack>
        {bottom.length > 0 ? (
          <HStack spacing={8} alignment="top">
            {bottom.map((column) => tile(column, 5))}
            {bottom.length === 1 ? <Spacer modifiers={[frame({ maxWidth: Infinity })]} /> : null}
          </HStack>
        ) : null}
        {extra > 0 ? (
          <Text modifiers={[font({ size: 11 }), foregroundStyle(tertiary)]}>
            {`+${extra} more ${extra === 1 ? 'column' : 'columns'}`}
          </Text>
        ) : null}
      </VStack>
    );
  } else {
    // Medium: up to three columns side by side.
    body = (
      <HStack spacing={8} alignment="top">
        {columns.slice(0, 3).map((column) => tile(column, 3))}
      </HStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={isSmall ? 8 : 9}
      modifiers={[containerBackground(card, 'widget'), widgetURL(boardUrl)]}>
      {body}
      {isSmall || !props?.boardRef || columns.length === 0 ? <Spacer /> : null}
      {footer}
    </VStack>
  );
};

export default createWidget('BoardsWidget', BoardsWidgetView);
