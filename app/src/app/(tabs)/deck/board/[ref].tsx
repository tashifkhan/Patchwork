import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { jiraImageHeaders, jiraIssueUrl } from '@/api/jira';
import type { SFSymbol } from 'expo-symbols';

import { BoardColumn } from '@/components/boards/board-column';
import { GlassIconButton } from '@/components/ui/glass-button';
import { BoardTile } from '@/components/boards/board-tile';
import { FilterSheet, JIRA_SCOPES } from '@/components/boards/filter-sheet';
import { PickerSheet } from '@/components/boards/picker-sheet';
import { useTheme } from '@/components/theme/context';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import {
  activeFilterCount,
  applyFilters,
  EMPTY_FILTERS,
  filterFacets,
  parseBoardRef,
  type BoardCardItem,
  type BoardColumnItem,
  type BoardFilters,
} from '@/features/boards/model';
import { useBoardDetail, useBoardSummaries } from '@/hooks/use-boards';
import { haptics } from '@/lib/haptics';
import { useTabBarContentPadding } from '@/lib/tab-bar';
import { useJiraCredentials } from '@/stores/jira-session-store';
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
 * Long-press a card to move it to another column.
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
  const credentials = useJiraCredentials();
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
  const visibleColumns = useMemo(() => applyFilters(detail.columns, filters), [detail.columns, filters]);
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

  function openCard(column: BoardColumnItem, card: BoardCardItem) {
    haptics.tap();
    const parsed = parseBoardRef(ref);
    if (!parsed) return;
    if (parsed.source === 'jira') {
      if (credentials) void WebBrowser.openBrowserAsync(jiraIssueUrl(credentials, card.id));
      return;
    }
    router.push({
      pathname: '/deck/card/[cardId]',
      params: { boardId: parsed.id, stackId: column.id, cardId: card.id },
    });
  }

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
  const subtitle =
    filterCount > 0
      ? `${shownCards} of ${totalCards} shown · ${filterCount} filter${filterCount === 1 ? '' : 's'}`
      : [detail.sprintName ?? detail.summary?.subtitle, scopeLabel].filter(Boolean).join(' · ');

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
      {source === 'deck' ? (
        <IconButton icon="table-column-plus-after" label="Add column" onPress={addColumn} />
      ) : null}
      {source === 'jira' && credentials && detail.summary ? (
        <IconButton
          icon="open-in-new"
          label="Open board in Jira"
          onPress={() => {
            const id = parseBoardRef(ref)?.id;
            void WebBrowser.openBrowserAsync(`${credentials.site}/secure/RapidBoard.jspa?rapidView=${id}`);
          }}
        />
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
      <FlatList
        horizontal
        data={visibleColumns}
        keyExtractor={(column) => column.id}
        showsHorizontalScrollIndicator={wideBoard}
        snapToInterval={wideBoard ? undefined : columnWidth + GAP}
        snapToAlignment="start"
        decelerationRate={wideBoard ? 'normal' : 'fast'}
        disableIntervalMomentum={!wideBoard}
        onLayout={(e) => setBoardWidth(e.nativeEvent.layout.width)}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP, paddingTop: 4 }}
        renderItem={({ item: column }) => (
          <BoardColumn
            column={column}
            width={columnWidth}
            imageHeaders={imageHeaders}
            refreshing={pulling}
            canCreate={detail.canCreate}
            emptyLabel={filterCount > 0 ? 'No cards match your filters' : undefined}
            bottomInset={bottomInset}
            onRefresh={() => {
              setPulling(true);
              void detail.refetch().finally(() => setPulling(false));
            }}
            onOpenCard={(card) => openCard(column, card)}
            onMoveCard={(card) => setMoving({ card, column })}
            onCreate={(cardTitle) => detail.createCard(column.id, cardTitle)}
            onMenu={source === 'deck' ? () => editColumn(column) : undefined}
          />
        )}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {topBar}
        {body}
      </View>

      <PickerSheet
        visible={switcherOpen}
        title="Switch board"
        items={summaries.boards.map((board) => ({
          key: board.ref,
          label: board.title,
          subtitle: board.subtitle,
          selected: board.ref === ref,
          leading: <BoardTile board={board} size={40} imageHeaders={credentials ? jiraImageHeaders(credentials) : undefined} />,
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
