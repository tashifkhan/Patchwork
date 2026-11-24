import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardScrollView } from '@/components/ui/keyboard';
import { ApiError } from '@/api/client';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { BoardStack } from '@/components/boards/board-stack';
import { BoardTile } from '@/components/boards/board-tile';
import { READABLE_MAX_WIDTH } from '@/hooks/use-adaptive-layout';
import { GroupedCard, useSettingsColors } from '@/components/settings/settings-list';
import { GlassIconButton } from '@/components/ui/glass-button';
import { useTheme } from '@/components/theme/context';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBanner } from '@/components/ui/status-banner';
import { LoadingState } from '@/components/ui/loading';
import type { BoardSummary } from '@/features/boards/model';
import { useBoardSummaries } from '@/hooks/use-boards';
import { describeSyncError } from '@/lib/friendly-error';
import { haptics } from '@/lib/haptics';
import { useTabBarContentPadding, useTabBarMinimizeOnScroll } from '@/lib/tab-bar';
import { useJiraSessionStore } from '@/stores/jira-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useSyncStatusStore } from '@/stores/sync-status-store';
import { Text, TextInput, View } from '@/tw';
import { ELASTIC_BUTTON, ELASTIC_ROW, ElasticView } from '@/components/ui/motion';

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

function needsCalDavAccount(error: unknown) {
  if (!(error instanceof ApiError)) return false;
  return error.status === 503 || /no caldav accounts|not configured|no account/i.test(error.message);
}

/**
 * Boards home, laid out like the Jira app's Spaces list: starred and recently
 * opened boards first, then every board grouped by where it lives. Tapping a
 * board opens it as horizontal columns.
 */
export default function BoardsScreen() {
  const { colors } = useTheme();
  const grouped = useSettingsColors();
  const insets = useSafeAreaInsets();
  const onTabBarScroll = useTabBarMinimizeOnScroll();
  const contentBottom = useTabBarContentPadding(112);
  const summaries = useBoardSummaries();
  const [retrying, setRetrying] = useState(false);
  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    summaries.refetch().finally(() => setRetrying(false));
  };
  const deckWarnings = useSyncStatusStore((state) => state.deckWarnings);
  const favorites = useSettingsStore((s) => s.favoriteBoards);
  const recents = useSettingsStore((s) => s.recentBoards);
  const toggleFavorite = useSettingsStore((s) => s.toggleFavoriteBoard);
  const jiraState = useJiraSessionStore((s) => s.state);

  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [pulling, setPulling] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return summaries.boards;
    return summaries.boards.filter(
      (board) => board.title.toLowerCase().includes(q) || board.subtitle.toLowerCase().includes(q)
    );
  }, [query, summaries.boards]);

  const byRef = useMemo(() => new Map(summaries.boards.map((board) => [board.ref, board])), [summaries.boards]);
  const starred = favorites.flatMap((ref) => byRef.get(ref) ?? []);
  const recentAll = recents.flatMap((ref) => byRef.get(ref) ?? []);
  const recent = recentAll.slice(0, 3);
  const jiraBoards = filtered.filter((board) => board.source === 'jira');
  const deckBoards = filtered.filter((board) => board.source === 'deck');
  const bothSources = jiraBoards.length > 0 && deckBoards.length > 0;
  // Android shows one stack: starred, then recently opened, then the rest.
  const stacked = [...new Map([...starred, ...recentAll, ...filtered].map((board) => [board.ref, board])).values()];

  const deckNeedsAccount = needsCalDavAccount(summaries.deckError);
  // iOS shows a failed Deck load as the empty state itself, not a banner above it.
  const deckUnreachable = IOS && !!summaries.deckError && !deckNeedsAccount;
  const noBoards = summaries.boards.length === 0;

  const jiraConnect = jiraState.status === 'disconnected' ? (
    <View style={{ paddingTop: 8 }}>
      <StatusBanner
        tone="info"
        icon="jira"
        sf="square.stack.3d.up"
        title="Bring in your Jira boards"
        body="Sprints and issues show up here next to your Deck boards."
        primary={{ label: 'Connect', onPress: () => router.push('/settings/jira') }}
      />
    </View>
  ) : null;

  function open(board: BoardSummary) {
    haptics.tap();
    router.push({ pathname: '/deck/board/[ref]', params: { ref: board.ref } });
  }

  // iOS: the native large title, search bar and + menu (see `iosHeader`);
  // Android keeps the in-content Material header.
  const header = IOS ? null : (
    <View style={{ paddingTop: insets.top + 16, gap: 16 }}>
      <View className="flex-row items-center" style={{ minHeight: 48 }}>
        <Text
          style={
            IOS
              ? { flex: 1, fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.4, color: colors.text }
              : { flex: 1, fontSize: 32, lineHeight: 40, fontWeight: '700', letterSpacing: -0.5, color: colors.text }
          }>
          Boards
        </Text>
        <IconButton
          icon={searching ? 'close' : 'magnify'}
          label={searching ? 'Close search' : 'Search boards'}
          onPress={() => {
            setSearching((value) => !value);
            setQuery('');
          }}
        />
        <IconButton icon="plus" label="New board" onPress={() => router.push('/new-board')} />
      </View>
      {searching ? (
        <View
          className="flex-row items-center"
          style={{ height: 52, borderRadius: 26, paddingHorizontal: 16, gap: 10, backgroundColor: colors.bg2 }}>
          <MaterialCommunityIcons name="magnify" size={20} color={colors.text2} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search boards"
            placeholderTextColor={colors.text3}
            returnKeyType="search"
            style={{ flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 }}
          />
        </View>
      ) : null}
      {!searching && !noBoards ? (
        <Text style={{ fontSize: 15, color: colors.text2, marginTop: -12 }}>
          {summaries.boards.length} {summaries.boards.length === 1 ? 'board' : 'boards'}
          {starred.length > 0 ? ` · ${starred.length} starred` : ''}
        </Text>
      ) : null}
    </View>
  );

  const emptyState = (
    <EmptyState
      icon={deckUnreachable ? 'cloud-alert-outline' : 'view-column-outline'}
      title={deckUnreachable ? (IOS ? "Can't Reach Deck" : "Can't reach Deck") : IOS ? 'No Boards' : 'No boards yet'}
      subtitle={
        deckUnreachable
          ? jiraState.status === 'connected'
            ? 'Check that your Nextcloud server is reachable.'
            : 'Check that your Nextcloud server is reachable, or connect Jira to see your projects.'
          : deckNeedsAccount && jiraState.status !== 'connected'
            ? 'Connect Jira, or a Nextcloud account for Deck, to see your boards here.'
            : 'Create a Deck board, or connect Jira to bring in your projects.'
      }
      actions={[
        ...(deckUnreachable
          ? [{ label: IOS ? 'Try Again' : 'Retry', onPress: () => void summaries.refetch(), variant: 'filled' as const }]
          : []),
        ...(jiraState.status !== 'connected'
          ? [{ label: 'Connect Jira', onPress: () => router.push('/settings/jira'), variant: 'filled' as const }]
          : []),
        ...(deckUnreachable
          ? []
          : [
              deckNeedsAccount
                ? {
                    label: 'Connect Nextcloud',
                    onPress: () => router.push('/settings/account'),
                    variant: 'tonal' as const,
                  }
                : {
                    label: IOS ? 'New Deck Board' : 'New Deck board',
                    onPress: () => router.push('/new-board'),
                    variant: 'tonal' as const,
                  },
            ]),
      ]}
    />
  );

  const jiraConnected = jiraState.status === 'connected';
  const iosHeader = IOS ? (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Boards',
          headerSearchBarOptions: {
            placeholder: 'Search boards',
            onChangeText: (event) => setQuery(event.nativeEvent.text),
            onCancelButtonPress: () => setQuery(''),
            hideWhenScrolling: true,
            obscureBackground: false,
          },
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="plus" accessibilityLabel="New">
          <Stack.Toolbar.MenuAction icon="rectangle.split.3x1" onPress={() => router.push('/new-board')}>
            New Deck Board
          </Stack.Toolbar.MenuAction>
          {deckBoards.length > 0 ? (
            <Stack.Toolbar.MenuAction icon="rectangle.stack.badge.plus" onPress={() => router.push('/new-card')}>
              New Card
            </Stack.Toolbar.MenuAction>
          ) : null}
          {jiraConnected ? (
            <Stack.Toolbar.MenuAction icon="square.and.pencil" onPress={() => router.push('/new-issue')}>
              New Jira Issue
            </Stack.Toolbar.MenuAction>
          ) : null}
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  ) : (
    <Stack.Screen options={{ headerShown: false }} />
  );

  if (summaries.isLoading && noBoards) {
    return (
      <>
        {iosHeader}
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <LoadingState message="Loading boards…" subtitle="Syncing Deck and Jira" />
        </View>
      </>
    );
  }

  return (
    <>
      {iosHeader}
      <KeyboardScrollView
        className="flex-1"
        style={{ backgroundColor: IOS ? grouped.screen : colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        scrollEventThrottle={16}
        onScroll={onTabBarScroll}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingBottom: contentBottom,
          gap: 8,
          // Tablets and unfolded foldables: keep the board list at a readable
          // width instead of stretching rows across the whole window.
          width: '100%',
          maxWidth: READABLE_MAX_WIDTH,
          alignSelf: 'center',
        }}
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            progressViewOffset={Platform.OS === 'android' ? insets.top + 12 : undefined}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bg3}
            onRefresh={() => {
              haptics.impact('light');
              setPulling(true);
              summaries.refetch().finally(() => setPulling(false));
            }}
          />
        }>
        {header}

        {jiraState.status === 'connected' && Object.keys(jiraState.expired).length > 0 ? (
          <StatusBanner
            tone="warning"
            icon="jira"
            sf="key.fill"
            title={
              Object.keys(jiraState.expired).length === jiraState.accounts.length
                ? 'Jira needs a new API token'
                : 'One Jira account needs a new API token'
            }
            body="Its boards stay hidden until you paste a fresh token."
            primary={{ label: 'Fix', onPress: () => router.push('/settings/jira') }}
          />
        ) : null}
        {summaries.jiraError && jiraState.status === 'connected' ? (
          <SyncErrorBanner error={summaries.jiraError} source="Jira boards" retrying={retrying} onRetry={retry} />
        ) : null}
        {/* iOS folds this into the empty state when there is nothing else on screen. */}
        {summaries.deckError && !deckNeedsAccount && !(IOS && noBoards) ? (
          <SyncErrorBanner error={summaries.deckError} source="Deck boards" retrying={retrying} onRetry={retry} />
        ) : null}
        {deckWarnings.length > 0 && !summaries.deckError ? (
          <SyncErrorBanner error={deckWarnings[0]} source="Deck boards" retrying={retrying} onRetry={retry} />
        ) : null}

        {noBoards ? (
          // iOS draws it over the list instead (see below), centred on screen.
          IOS ? null : (
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 48 }}>{emptyState}</View>
          )
        ) : !IOS ? (
          query.trim() && filtered.length === 0 ? (
            <Text style={{ fontSize: 15, color: colors.text2, marginTop: 24, textAlign: 'center' }}>No boards match</Text>
          ) : (
            <>
              <View style={{ paddingTop: 16 }}>
                <BoardStack
                  boards={query.trim() ? filtered : stacked}
                  favorites={favorites}
                  recents={recents}
                  onOpen={open}
                  onToggleFavorite={toggleFavorite}
                />
              </View>
              {jiraConnect}
            </>
          )
        ) : query.trim() ? (
          <BoardGroup
            title={filtered.length === 0 ? 'No boards match' : 'Results'}
            boards={filtered}
            favorites={favorites}
            onOpen={open}
            onToggleFavorite={toggleFavorite}
          />
        ) : (
          <>
            {starred.length > 0 ? (
              <BoardGroup
                title="Starred"
                boards={starred}
                favorites={favorites}
                onOpen={open}
                onToggleFavorite={toggleFavorite}
              />
            ) : null}
            {recent.length > 0 ? (
              <BoardGroup
                title="Recently viewed"
                boards={recent}
                favorites={favorites}
                onOpen={open}
                onToggleFavorite={toggleFavorite}
              />
            ) : null}
            {jiraBoards.length > 0 ? (
              <BoardGroup
                title={bothSources ? 'Jira' : 'All boards'}
                boards={jiraBoards}
                favorites={favorites}
                onOpen={open}
                onToggleFavorite={toggleFavorite}
              />
            ) : null}
            {deckBoards.length > 0 ? (
              <BoardGroup
                title={bothSources ? 'Deck' : 'All boards'}
                boards={deckBoards}
                favorites={favorites}
                onOpen={open}
                onToggleFavorite={toggleFavorite}
              />
            ) : null}
            {jiraConnect}
          </>
        )}
      </KeyboardScrollView>
      {IOS && noBoards ? (
        // Like SwiftUI's `.overlay { ContentUnavailableView }`: centred on
        // the screen, above the (empty) list.
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}>
          {emptyState}
        </View>
      ) : null}
    </>
  );
}

function BoardGroup({
  title,
  boards,
  favorites,
  onOpen,
  onToggleFavorite,
}: {
  title: string;
  boards: BoardSummary[];
  favorites: string[];
  onOpen: (board: BoardSummary) => void;
  onToggleFavorite: (ref: string) => void;
}) {
  const { colors } = useTheme();
  const grouped = useSettingsColors();
  // iOS only (Android shows a BoardStack): an inset-grouped list, one
  // rounded card with hairlines inset to the text.
  return (
      <View style={{ paddingTop: 22, gap: 7 }}>
        <Text style={{ fontSize: 13, color: colors.text2, paddingHorizontal: 16 }}>
          {title}
        </Text>
        <GroupedCard radius={26}>
          {boards.map((board, index) => {
            const starredBoard = favorites.includes(board.ref);
            return (
              <View key={board.ref}>
                {index > 0 ? (
                  <View style={{ height: 0.5, marginLeft: 72, backgroundColor: colors.separator }} />
                ) : null}
                <ElasticView {...ELASTIC_ROW}>
                <Pressable
                  onPress={() => onOpen(board)}
                  accessibilityRole="button"
                  accessibilityLabel={`${board.title}, ${board.subtitle}`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    minHeight: 64,
                    paddingLeft: 16,
                    paddingRight: 6,
                    backgroundColor: pressed ? grouped.pressed : 'transparent',
                  })}>
                  <BoardTile board={board} size={42} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 17, letterSpacing: -0.4, color: colors.text }}>
                      {board.title}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 15, color: colors.text2 }}>
                      {board.subtitle}
                    </Text>
                  </View>
                  <ElasticView {...ELASTIC_BUTTON}>
                  <Pressable
                    onPress={() => {
                      haptics.toggle(!starredBoard);
                      onToggleFavorite(board.ref);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={starredBoard ? `Unstar ${board.title}` : `Star ${board.title}`}
                    hitSlop={6}
                    style={({ pressed }) => ({
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.5 : 1,
                    })}>
                    <SymbolView
                      name={starredBoard ? 'star.fill' : 'star'}
                      size={20}
                      tintColor={starredBoard ? colors.yellow : colors.text3}
                    />
                  </Pressable>
                  </ElasticView>
                </Pressable>
                </ElasticView>
              </View>
            );
          })}
        </GroupedCard>
      </View>
    );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  if (IOS) {
    return <GlassIconButton sf={SF_FOR[icon] ?? 'circle'} icon={icon} label={label} onPress={onPress} style={{ marginLeft: 8 }} />;
  }
  return (
    <ElasticView {...ELASTIC_BUTTON}>
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
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.bg2 : 'transparent',
      })}>
      <MaterialCommunityIcons name={icon} size={26} color={colors.text} />
    </Pressable>
    </ElasticView>
  );
}

/** A failed board source, in plain words, with the raw error behind "Details". */
function SyncErrorBanner({
  error,
  source,
  retrying,
  onRetry,
}: {
  error: unknown;
  source: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  const copy = describeSyncError(error, source);
  const auth = copy.kind === 'auth';
  return (
    <StatusBanner
      tone={copy.kind === 'other' || auth ? 'error' : 'warning'}
      icon={copy.kind === 'offline' ? 'cloud-off-outline' : auth ? 'key-alert-outline' : 'cloud-alert-outline'}
      sf={copy.kind === 'offline' ? 'icloud.slash' : auth ? 'key.slash' : 'exclamationmark.icloud'}
      title={copy.title}
      body={copy.body}
      detail={copy.detail}
      primary={
        auth
          ? { label: 'Settings', onPress: () => router.push('/settings') }
          : { label: 'Retry', onPress: onRetry, busy: retrying }
      }
    />
  );
}
