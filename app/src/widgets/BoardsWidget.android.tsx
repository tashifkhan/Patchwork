import { Box, Button, Column, getMaterialColors, LazyColumn, Row, Spacer, Text } from '@expo/ui/jetpack-compose';
import {
  background,
  cornerRadius,
  fillMaxSize,
  fillMaxWidth,
  height,
  padding,
  paddingAll,
  size,
  width,
} from '@expo/ui/jetpack-compose/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { BoardsProps, WidgetBoardCard, WidgetBoardColumn } from './shared/types';

// Android Boards widget, Material 3 style:
//   header      board name, with the sprint (Jira) or card count in a tonal pill
//   filter chips one per column; tapping one switches the list in place, no app launch
//   list        the picked column's cards as M3 list items on surfaceBright
//
// A chip is a Button with its own children: expo-widgets turns that into a clickable box
// that keeps our styling, and the props its onClick returns are merged into the widget's
// props (`selectedColumn`) before it re-renders.
//
// Glance here has no weight modifier, so trailing items are right-aligned by overlaying an
// end-aligned Row in a Box. See TodayWidget.android.tsx for why helpers live inside.
const BoardsWidgetView = (props: BoardsProps | undefined, _env: WidgetEnvironment) => {
  'widget';
  const c = getMaterialColors();
  const columns: WidgetBoardColumn[] = props?.columns ?? [];
  const chips = columns.slice(0, 4);
  const selected = columns.find((column) => column.id === props?.selectedColumn) ?? columns[0];

  const formatDue = (due: string | undefined | null, overdue: boolean): string => {
    if (!due) return '';
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
    const d = dateOnly
      ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
      : new Date(due);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDue - startOfToday) / 86400000);
    if (overdue) return `Overdue · ${-days}d`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    if (days > 1 && days < 7) return `Due ${d.toLocaleDateString(undefined, { weekday: 'short' })}`;
    return `Due ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  };

  const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

  // Jira issue types take a tone from the wallpaper palette rather than Jira's fixed
  // colors, so they stay Material You: bugs error, stories tertiary, epics secondary.
  const typeTone = (type: string | null | undefined): string => {
    const name = (type ?? '').toLowerCase();
    if (name.includes('bug')) return c.error;
    if (name.includes('story')) return c.tertiary;
    if (name.includes('epic')) return c.secondary;
    return c.primary;
  };

  const pill = (text: string, fill: string, ink: string) => (
    <Box contentAlignment="center" modifiers={[background(fill), cornerRadius(12), padding(10, 4, 10, 4)]}>
      <Text color={ink} style={{ fontSize: 12, fontWeight: '500' }} maxLines={1}>
        {text}
      </Text>
    </Box>
  );

  // M3 filter chip: 8dp corners, secondaryContainer when selected, a tonal surface when not.
  const chip = (column: WidgetBoardColumn, index: number) => {
    const on = column.id === selected?.id;
    return (
      <Row key={column.id} verticalAlignment="center">
        {index > 0 ? <Spacer modifiers={[width(6)]} /> : null}
        <Button
          target={`column-${index}`}
          onClick={() => ({ selectedColumn: column.id })}
          modifiers={[
            background(on ? c.secondaryContainer : c.surfaceContainerHighest),
            cornerRadius(8),
            padding(10, 6, 10, 6),
          ]}>
          <Row verticalAlignment="center">
            <Text
              color={on ? c.onSecondaryContainer : c.onSurfaceVariant}
              style={{ fontSize: 12, fontWeight: '500' }}
              maxLines={1}>
              {shorten(column.title, chips.length > 3 ? 9 : 13)}
            </Text>
            <Spacer modifiers={[width(5)]} />
            <Text color={on ? c.onSecondaryContainer : c.outline} style={{ fontSize: 12 }}>
              {String(column.count)}
            </Text>
          </Row>
        </Button>
      </Row>
    );
  };

  // M3 list item: leading tone dot, headline, supporting text, trailing assignee avatar.
  const item = (card: WidgetBoardCard) => {
    const due = formatDue(card.due, card.overdue);
    // Medium is Jira's default, so it says nothing; only the others are called out.
    const priority = card.priority && card.priority.toLowerCase() !== 'medium' ? card.priority : null;
    const supporting = [card.key, card.type, priority, card.sprint, due].filter(Boolean).join('  ·  ');
    return (
      <Column key={card.id} modifiers={[fillMaxWidth(), padding(0, 0, 0, 3)]}>
        <Box
          contentAlignment="centerStart"
          modifiers={[fillMaxWidth(), background(c.surfaceBright), cornerRadius(16)]}>
          <Row
            verticalAlignment="center"
            modifiers={[fillMaxWidth(), padding(14, 11, card.assignee ? 54 : 14, 11)]}>
            <Box modifiers={[size(10, 10), cornerRadius(5), background(card.overdue ? c.error : typeTone(card.type))]} />
            <Spacer modifiers={[width(12)]} />
            <Column>
              <Text color={c.onSurface} style={{ fontSize: 14, fontWeight: '500' }} maxLines={1}>
                {card.title}
              </Text>
              {supporting ? (
                <Text color={card.overdue ? c.error : c.onSurfaceVariant} style={{ fontSize: 12 }} maxLines={1}>
                  {supporting}
                </Text>
              ) : null}
            </Column>
          </Row>
          {card.assignee ? (
            <Row horizontalAlignment="end" verticalAlignment="center" modifiers={[fillMaxWidth(), padding(0, 0, 12, 0)]}>
              <Box contentAlignment="center" modifiers={[size(30, 30), cornerRadius(15), background(c.tertiaryContainer)]}>
                <Text color={c.onTertiaryContainer} style={{ fontSize: 11, fontWeight: '500' }}>
                  {card.assignee}
                </Text>
              </Box>
            </Row>
          ) : null}
        </Box>
      </Column>
    );
  };

  const message = (title: string, body: string) => (
    <Column modifiers={[fillMaxWidth(), background(c.surfaceBright), cornerRadius(16), paddingAll(16)]}>
      <Text color={c.onSurface} style={{ fontSize: 14, fontWeight: '500' }}>
        {title}
      </Text>
      <Spacer modifiers={[height(2)]} />
      <Text color={c.onSurfaceVariant} style={{ fontSize: 12 }}>
        {body}
      </Text>
    </Column>
  );

  const sprintLabel = props?.sprintName
    ? props.sprintTiming
      ? `${props.sprintName} · ${props.sprintTiming}`
      : props.sprintName
    : null;
  const shownCards = selected ? selected.cards : [];
  const hidden = selected ? selected.count - shownCards.length : 0;

  return (
    <Column modifiers={[fillMaxSize(), background(c.surfaceContainer), cornerRadius(24), paddingAll(14)]}>
      {props?.boardRef ? (
        <Column modifiers={[fillMaxWidth()]}>
          <Box modifiers={[fillMaxWidth(), padding(2, 0, 0, 10)]}>
            <Row verticalAlignment="center" modifiers={[fillMaxWidth(), padding(0, 0, sprintLabel ? 168 : 84, 0)]}>
              <Text color={c.onSurface} style={{ fontSize: 16, fontWeight: '500' }} maxLines={1}>
                {props.title || 'Board'}
              </Text>
            </Row>
            <Row horizontalAlignment="end" verticalAlignment="center" modifiers={[fillMaxWidth()]}>
              {sprintLabel
                ? pill(shorten(sprintLabel, 24), c.tertiaryContainer, c.onTertiaryContainer)
                : pill(`${props.totalCards} ${props.totalCards === 1 ? 'card' : 'cards'}`, c.secondaryContainer, c.onSecondaryContainer)}
            </Row>
          </Box>
          {chips.length > 1 ? (
            <Row verticalAlignment="center" modifiers={[fillMaxWidth(), padding(0, 0, 0, 10)]}>
              {chips.map(chip)}
            </Row>
          ) : null}
        </Column>
      ) : null}
      {!props?.boardRef ? (
        message('No board yet', 'Open a board in Patchwork to show it here.')
      ) : !selected ? (
        message('Nothing here', 'This board has no columns yet.')
      ) : shownCards.length === 0 ? (
        message(`Nothing in ${selected.title}`, 'Cards you add to this column show up here.')
      ) : (
        <LazyColumn modifiers={[fillMaxWidth()]}>
          {shownCards.map(item)}
          {hidden > 0 ? (
            <Row key="more" modifiers={[fillMaxWidth(), padding(14, 6, 14, 0)]}>
              <Text color={c.onSurfaceVariant} style={{ fontSize: 12, fontWeight: '500' }}>
                {`${hidden} more in ${selected.title}`}
              </Text>
            </Row>
          ) : null}
        </LazyColumn>
      )}
    </Column>
  );
};

export default createWidget<BoardsProps>('BoardsWidget', BoardsWidgetView, {
  generatedAt: 0,
  boardRef: null,
  title: '',
  subtitle: '',
  source: null,
  url: 'patchwork:///deck',
  sprintName: null,
  totalCards: 0,
  columns: [],
});
