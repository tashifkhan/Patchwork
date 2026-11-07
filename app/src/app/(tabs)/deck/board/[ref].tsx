import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, useWindowDimensions, type FlatList, type View as RNView } from 'react-native';
import { LegacyFlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { jiraImageHeaders, sprintTiming } from '@/api/jira';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { BoardColumn } from '@/components/boards/board-column';
import { useBoardDrag, type DragDrop } from '@/components/boards/board-drag';
import { GlassIconButton } from '@/components/ui/glass-button';
import { BoardTile } from '@/components/boards/board-tile';
import { FilterSheet, JIRA_SCOPES } from '@/components/boards/filter-sheet';
import { PickerSheet } from '@/components/boards/picker-sheet';
import { SprintBar } from '@/components/boards/sprint-bar';
import { useTheme } from '@/components/theme/context';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTERS,
  filterFacets,
  groupBySprint,
  parseBoardRef,
  parseJiraBoardId,
  type BoardCardItem,
  type BoardColumnItem,
  type BoardFilters,
} from '@/features/boards/model';
import { useBoardDetail, useBoardSummaries } from '@/hooks/use-boards';
import { haptics } from '@/lib/haptics';
import { useTabBarContentPadding } from '@/lib/tab-bar';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

const GAP = 12;
const IOS = Platform.OS === 'ios';

/** Material glyph → SF Symbol for the iOS glass buttons. */
const SF_FOR: Record<string, SFSymbol> = {
  magnify: 'magnifyingglass',
  close: 'xmark',
  plus: 'plus',
  'chevron-left': 'chevron.left',
  'arrow-left': 'chevron.left',
  'filter-variant': 'line.3.horizontal.decrease',
  'table-column-plus-after': 'rectangle.badge.plus',
  'open-in-new': 'arrow.up.right.square',
};

const SIDE = 16;
/** Column width bounds when several columns share a wide window. */
const MIN_WIDE_COLUMN = 300;
const MAX_WIDE_COLUMN = 400;

/**
 * One board as horizontal columns, like the Jira app's Board view. Swipe
 * between columns; each one scrolls its own cards and has an inline Create.
 * Long-press a card and drag it to reorder it or drop it in another column;
 * long-press without moving opens the "Move to" sheet.
 */
export default function BoardScreen() {
  const { ref = '' } = useLocalSearchParams<{ ref: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bottomInset = useTabBarContentPadding(16);
  const detail = useBoardDetail(ref);
  const summaries = useBoardSummaries();
  const markViewed = useSettingsStore((s) => s.markBoardViewed);
  const credentials = detail.jiraCredentials ?? null;
  const source = parseBoardRef(ref)?.source;
  const imageHeaders = useMemo(
    () => (source === 'jira' && credentials ? jiraImageHeaders(credentials) : undefined),
    [credentials, source]
  );

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [moving, setMoving] = useState<{ card: BoardCardItem; column: BoardColumnItem } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  // Filters are kept per board for this visit, so switching boards starts clean.
  const [filtersByRef, setFiltersByRef] = useState<Record<string, BoardFilters>>({});
  const filters = filtersByRef[ref] ?? EMPTY_FILTERS;
  const filterCount = activeFilterCount(filters);
  const jiraScope = useSettingsStore((s) => s.jiraIssueScope);
  const setJiraScope = useSettingsStore((s) => s.setJiraIssueScope);
  const facets = useMemo(() => filterFacets(detail.columns), [detail.columns]);
  // Cards from several sprints (and the backlog) sit in sprint groups.
  const { columns: visibleColumns, grouped: sprintGroups } = useMemo(
    () => groupBySprint(applyFilters(detail.columns, filters)),
    [detail.columns, filters]
  );
  const totalCards = detail.columns.reduce((sum, column) => sum + column.cards.length, 0);
  const shownCards = visibleColumns.reduce((sum, column) => sum + column.cards.length, 0);

  useEffect(() => {
    if (ref) markViewed(ref);
  }, [markViewed, ref]);

  // Measured, not the window: on an iPad with the sidebar open, a tablet
  // with the navigation rail, or an app sharing the screen in split view,
  // the board gets less than the full window width.
  const [boardWidth, setBoardWidth] = useState(width);
  // Phones show one column with the next peeking in and snap column by
  // column. Wide windows (tablets, unfolded foldables) fit as many columns
  // as there is room for, stretched to fill the width, and scroll freely.
  const wideBoard = boardWidth >= 700;
  const fitCount = wideBoard
    ? Math.max(
        1,
        Math.min(
          visibleColumns.length || 1,
          Math.floor((boardWidth - SIDE * 2 + GAP) / (MIN_WIDE_COLUMN + GAP))
        )
      )
    : 1;
  const columnWidth = wideBoard
    ? Math.min(
        MAX_WIDE_COLUMN,
        Math.floor((boardWidth - SIDE * 2 - GAP * (fitCount - 1)) / fitCount)
      )
    : Math.min(boardWidth - SIDE * 2 - 40, 420);

  /** The full create form: New Issue for Jira, New Card for Deck, starting in `columnId` if given. */
  function openNewItem(columnId?: string) {
    haptics.tap();
    const parsed = parseBoardRef(ref);
    if (!parsed) return;
    if (parsed.source === 'jira') {
      const jiraId = parseJiraBoardId(parsed.id);
      router.push({
        pathname: '/new-issue',
        params: {
          ...(jiraId ? { board: String(jiraId.boardId) } : {}),
          ...(credentials ? { account: credentials.id } : {}),
          ...(columnId ? { column: columnId } : {}),
          // New issues land in the sprint (or backlog) being viewed.
          // The All view passes nothing, so the form picks the active sprint.
          ...(detail.jira?.sprints.length && detail.jira.view.kind !== 'board'
            ? {
                sprint:
                  detail.jira.view.kind === 'sprint' ? String(detail.jira.view.sprintId) : 'backlog',
              }
            : {}),
        },
      });
      return;
    }
    router.push({ pathname: '/new-card', params: { boardId: parsed.id, ...(columnId ? { stackId: columnId } : {}) } });
  }

  function openCard(column: BoardColumnItem, card: BoardCardItem) {
    haptics.tap();
    const parsed = parseBoardRef(ref);
    if (!parsed) return;
    if (parsed.source === 'jira') {
      router.push({
        pathname: '/deck/issue/[key]',
        params: {
          key: card.id,
          ...(credentials ? { account: credentials.id } : {}),
          // Lets the issue screen offer this board's sprints.
          board: String(parseJiraBoardId(parsed.id)?.boardId ?? ''),
        },
      });
      return;
    }
    router.push({
      pathname: '/deck/card/[cardId]',
      params: { boardId: parsed.id, stackId: column.id, cardId: card.id },
    });
  }

  /** A drag landed. `drop.index` counts visible cards; the server wants the full column. */
  async function dropCard(drop: DragDrop) {
    const full = (detail.columns.find((column) => column.id === drop.toColumnId)?.cards ?? []).filter(
      (card) => card.id !== drop.card.id
    );
    const visible = (visibleColumns.find((column) => column.id === drop.toColumnId)?.cards ?? []).filter(
      (card) => card.id !== drop.card.id
    );
    const before = visible[drop.index];
    const last = visible[visible.length - 1];
    const toIndex = before
      ? Math.max(0, full.findIndex((card) => card.id === before.id))
      : last
        ? full.findIndex((card) => card.id === last.id) + 1
        : full.length;
    haptics.impact('light');
    try {
      await detail.moveCard({
        cardId: drop.card.id,
        fromColumnId: drop.fromColumnId,
        toColumnId: drop.toColumnId,
        toIndex,
      });
    } catch (error) {
      haptics.error();
      setErrorMessage(error instanceof Error ? error.message : 'Could not move the card.');
    }
  }

  const dragContainerRef = useRef<RNView>(null);
  const boardListRef = useRef<FlatList<BoardColumnItem>>(null);
  const drag = useBoardDrag({
    containerRef: dragContainerRef,
    boardRef: boardListRef,
    columns: visibleColumns,
    columnWidth,
    imageHeaders,
    snapInterval: wideBoard ? undefined : columnWidth + GAP,
    onDrop: (drop) => void dropCard(drop),
    onHold: (card, column) => setMoving({ card, column }),
  });

  async function moveTo(target: BoardColumnItem) {
    const current = moving;
    setMoving(null);
    if (!current || current.column.id === target.id) return;
    try {
      await detail.moveCard({
        cardId: current.card.id,
        fromColumnId: current.column.id,
        toColumnId: target.id,
        toIndex: target.cards.length,
      });
      haptics.success();
    } catch (error) {
      haptics.error();
      setErrorMessage(error instanceof Error ? error.message : 'Could not move the card.');
    }
  }

  function editColumn(column: BoardColumnItem) {
    const parsed = parseBoardRef(ref);
    if (!parsed || parsed.source !== 'deck') return;
    const index = detail.columns.findIndex((candidate) => candidate.id === column.id);
    router.push({
      pathname: '/column',
      params: { boardId: parsed.id, stackId: column.id, title: column.title, order: String((index + 1) * 10) },
    });
  }

  function reorderColumns() {
    const parsed = parseBoardRef(ref);
    if (!parsed || parsed.source !== 'deck') return;
    router.push({ pathname: '/reorder-columns', params: { boardId: parsed.id } });
  }

  function addColumn() {
    const parsed = parseBoardRef(ref);
    if (!parsed || parsed.source !== 'deck') return;
    router.push({
      pathname: '/column',
      params: { boardId: parsed.id, order: String((detail.columns.length + 1) * 10) },
    });
  }

  const title = detail.summary?.title ?? (detail.isLoading ? '' : 'Board');
  const scopeLabel = source === 'jira' ? JIRA_SCOPES.find((option) => option.value === jiraScope)?.title : undefined;
  // What is on screen: the sprint (with time left) or the backlog, then whose issues.
  const sliceLabel = detail.jira?.sprint
    ? [detail.jira.sprint.name, sprintTiming(detail.jira.sprint)].filter(Boolean).join(' · ')
    : detail.jira?.view.kind === 'backlog'
      ? 'Backlog'
      : undefined;
  const subtitle =
    filterCount > 0
      ? `${shownCards} of ${totalCards} shown · ${filterCount} filter${filterCount === 1 ? '' : 's'}`
      : [sliceLabel ?? detail.summary?.subtitle, scopeLabel].filter(Boolean).join(' · ');
  // Scrum boards with sprints get the switcher; kanban boards have none.
  const showSprints = source === 'jira' && (detail.jira?.sprints.length ?? 0) > 0;

  function openInJira() {
    if (!credentials) return;
    const id = parseJiraBoardId(parseBoardRef(ref)?.id ?? '')?.boardId;
    void WebBrowser.openBrowserAsync(`${credentials.site}/secure/RapidBoard.jspa?rapidView=${id}`);
  }

  // iOS: the system navigation bar. The title doubles as the board switcher
  // (like the title menus in Files and Mail); filter and the options menu are
  // native glass bar buttons. Android keeps the Material top bar below.
  const iosHeader = (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title,
          headerLargeTitle: false,
          // The board scrolls sideways under its own columns, so a solid bar
          // keeps the columns from sliding under the glass.
          headerTransparent: false,
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerTitle: () => (
            <Pressable
              onPress={() => {
                haptics.tap();
                setSwitcherOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${title}. Switch board`}
              style={({ pressed }) => ({ alignItems: 'center', maxWidth: 240, opacity: pressed ? 0.6 : 1 })}>
              <View className="flex-row items-center" style={{ gap: 4 }}>
                <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '600', color: colors.text, flexShrink: 1 }}>
                  {title}
                </Text>
                <SymbolView name="chevron.down" size={11} weight="bold" tintColor={colors.text2} />
              </View>
              {subtitle ? (
                <Text numberOfLines={1} style={{ fontSize: 12, color: colors.text2 }}>
                  {subtitle}
                </Text>
              ) : null}
            </Pressable>
          ),
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={filterCount > 0 ? 'line.3.horizontal.decrease.circle.fill' : 'line.3.horizontal.decrease'}
          accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} on` : 'Filter'}
          onPress={() => setFilterOpen(true)}
        />
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel="Board options">
          {[
            detail.canCreate ? (
              <Stack.Toolbar.MenuAction key="new" icon="plus" onPress={() => openNewItem()}>
                {source === 'jira' ? 'New Issue' : 'New Card'}
              </Stack.Toolbar.MenuAction>
            ) : null,
            source === 'deck' ? (
              <Stack.Toolbar.MenuAction key="column" icon="rectangle.badge.plus" onPress={addColumn}>
                Add Column
              </Stack.Toolbar.MenuAction>
            ) : null,
            source === 'deck' && detail.columns.length > 1 ? (
              <Stack.Toolbar.MenuAction key="reorder" icon="arrow.left.arrow.right" onPress={reorderColumns}>
                Reorder Columns
              </Stack.Toolbar.MenuAction>
            ) : null,
            <Stack.Toolbar.MenuAction key="switch" icon="rectangle.2.swap" onPress={() => setSwitcherOpen(true)}>
              Switch Board
            </Stack.Toolbar.MenuAction>,
            source === 'jira' && credentials ? (
              <Stack.Toolbar.MenuAction key="jira" icon="arrow.up.right.square" onPress={openInJira}>
                Open in Jira
              </Stack.Toolbar.MenuAction>
            ) : null,
          ].filter(Boolean)}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );

  const topBar = (
    <View
      className="flex-row items-center"
      style={{ paddingTop: insets.top + 8, paddingHorizontal: 8, paddingBottom: 8, gap: 4 }}>
      <IconButton
        icon={Platform.OS === 'ios' ? 'chevron-left' : 'arrow-left'}
        label="Back to boards"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/deck'))}
      />
      <Pressable
        onPress={() => {
          haptics.tap();
          setSwitcherOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title}. Switch board`}
        style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1, paddingHorizontal: 4 })}>
        <View className="flex-row items-center" style={{ gap: 4 }}>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, fontSize: 24, fontWeight: '600', letterSpacing: -0.3, color: colors.text }}>
            {title}
          </Text>
          <MaterialCommunityIcons name="menu-down" size={28} color={colors.text2} />
        </View>
        {subtitle ? (
          <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text2 }}>
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
      <IconButton
        icon="filter-variant"
        label={filterCount > 0 ? `Filters, ${filterCount} on` : 'Filter'}
        badge={filterCount}
        onPress={() => setFilterOpen(true)}
      />
      {detail.canCreate ? (
        <IconButton
          icon="plus"
          label={source === 'jira' ? 'New issue' : 'New card'}
          onPress={() => openNewItem()}
        />
      ) : null}
      {source === 'deck' ? (
        <IconButton icon="table-column-plus-after" label="Add column" onPress={addColumn} />
      ) : null}
      {source === 'jira' && credentials && detail.summary ? (
        <IconButton icon="open-in-new" label="Open board in Jira" onPress={openInJira} />
      ) : null}
    </View>
  );

  let body: React.ReactNode;
  if (detail.isLoading) {
    body = <LoadingState message="Loading board…" fullScreen={false} />;
  } else if (detail.error && detail.columns.length === 0) {
    body = (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          icon="cloud-alert-outline"
          title="Couldn't load this board"
          subtitle={detail.error instanceof Error ? detail.error.message : 'Try again in a moment.'}
          actions={[{ label: 'Retry', onPress: () => void detail.refetch(), variant: 'filled' }]}
        />
      </View>
    );
  } else if (detail.columns.length === 0) {
    body = (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          icon="view-column-outline"
          title="No columns yet"
          subtitle={source === 'deck' ? 'Add a column to start adding cards.' : 'This board has no columns mapped to statuses.'}
          actions={source === 'deck' ? [{ label: 'Add column', onPress: addColumn, variant: 'filled' }] : undefined}
        />
      </View>
    );
  } else {
    body = (
      <LegacyFlatList
        ref={boardListRef}
        horizontal
        data={visibleColumns}
        scrollEnabled={drag.dragging == null}
        // Every column stays mounted so a drag can reach and measure it.
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        onScroll={(e) => drag.board.onScroll(e.nativeEvent.contentOffset.x)}
        onContentSizeChange={(w) => drag.board.onContentWidth(w)}
        extraData={drag.target ?? drag.dragging}
        keyExtractor={(column) => column.id}
        showsHorizontalScrollIndicator={wideBoard}
        snapToInterval={wideBoard ? undefined : columnWidth + GAP}
        snapToAlignment="start"
        decelerationRate={wideBoard ? 'normal' : 'fast'}
        disableIntervalMomentum={!wideBoard}
        onLayout={(e) => {
          setBoardWidth(e.nativeEvent.layout.width);
          drag.board.onLayout(e.nativeEvent.layout.width);
        }}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP, paddingTop: 4 }}
        renderItem={({ item: column }) => (
          <BoardColumn
            column={column}
            sprintGroups={sprintGroups}
            width={columnWidth}
            imageHeaders={imageHeaders}
            refreshing={pulling}
            canCreate={detail.canCreate}
            emptyLabel={
              filterCount > 0
                ? 'No cards match your filters'
                : detail.jira?.view.kind === 'backlog'
                  ? 'Nothing in the backlog here'
                  : detail.jira?.sprint?.state === 'future'
                    ? 'Nothing planned here yet'
                    : undefined
            }
            bottomInset={bottomInset}
            onRefresh={() => {
              setPulling(true);
              void detail.refetch().finally(() => setPulling(false));
            }}
            onOpenCard={(card) => openCard(column, card)}
            onMoveCard={(card) => setMoving({ card, column })}
            onCreate={(cardTitle) => detail.createCard(column.id, cardTitle)}
            onCreateDetailed={() => openNewItem(column.id)}
            onMenu={source === 'deck' ? () => editColumn(column) : undefined}
            drag={drag}
          />
        )}
      />
    );
  }

  return (
    <>
      {IOS ? iosHeader : <Stack.Screen options={{ headerShown: false }} />}
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {IOS ? null : topBar}
        {showSprints && detail.jira ? (
          <SprintBar sprints={detail.jira.sprints} view={detail.jira.view} onSelect={detail.jira.setView} />
        ) : null}
        <View
          ref={dragContainerRef}
          collapsable={false}
          style={{ flex: 1, opacity: detail.jira?.switching ? 0.5 : 1 }}>
          {body}
          {drag.overlay}
        </View>
      </View>

      <PickerSheet
        visible={switcherOpen}
        title="Switch board"
        items={summaries.boards.map((board) => ({
          key: board.ref,
          label: board.title,
          subtitle: board.subtitle,
          selected: board.ref === ref,
          leading: <BoardTile board={board} size={40} />,
          onPress: () => {
            setSwitcherOpen(false);
            if (board.ref !== ref) router.setParams({ ref: board.ref });
          },
        }))}
        onClose={() => setSwitcherOpen(false)}
      />

      <FilterSheet
        visible={filterOpen}
        scope={source === 'jira' ? jiraScope : undefined}
        onScopeChange={source === 'jira' ? setJiraScope : undefined}
        facets={facets}
        filters={filters}
        onChange={(next) => setFiltersByRef((current) => ({ ...current, [ref]: next }))}
        onClose={() => setFilterOpen(false)}
      />

      <PickerSheet
        visible={moving != null}
        title="Move to"
        subtitle={moving ? [moving.card.key, moving.card.title].filter(Boolean).join(' · ') : undefined}
        items={detail.columns.map((column) => ({
          key: column.id,
          label: column.title,
          subtitle: `${column.cards.length} card${column.cards.length === 1 ? '' : 's'}`,
          icon: 'view-column-outline',
          selected: column.id === moving?.column.id,
          onPress: () => void moveTo(column),
        }))}
        onClose={() => setMoving(null)}
      />

      <NativeAlert
        visible={errorMessage != null}
        title="Could not move card"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </>
  );
}

function IconButton({
  icon,
  label,
  badge = 0,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  /** Small count in the corner, e.g. active filters. */
  badge?: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  if (IOS) {
    return (
      <GlassIconButton
        sf={SF_FOR[icon] ?? 'circle'}
        icon={icon}
        label={label}
        badge={badge}
        symbolColor={badge > 0 ? colors.accent : undefined}
        onPress={onPress}
        style={{ marginHorizontal: 2 }}
      />
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: pressed ? 14 : 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.bg2 : 'transparent',
      })}>
      <MaterialCommunityIcons name={icon} size={26} color={badge > 0 ? colors.accent : colors.text} />
      {badge > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accent,
          }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.onAccent }}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
