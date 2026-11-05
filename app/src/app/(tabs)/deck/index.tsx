import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { jiraImageHeaders } from '@/api/jira';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { BoardTile } from '@/components/boards/board-tile';
import { READABLE_MAX_WIDTH } from '@/hooks/use-adaptive-layout';
import { useSettingsColors } from '@/components/settings/settings-list';
import { GlassIconButton } from '@/components/ui/glass-button';
import { useTheme } from '@/components/theme/context';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import type { BoardSummary } from '@/features/boards/model';
import { useBoardSummaries } from '@/hooks/use-boards';
import { haptics } from '@/lib/haptics';
import { useTabBarContentPadding, useTabBarMinimizeOnScroll } from '@/lib/tab-bar';
import { useJiraCredentials, useJiraSessionStore } from '@/stores/jira-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useSyncStatusStore } from '@/stores/sync-status-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

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

const OUTER_RADIUS = 24;
const INNER_RADIUS = 6;

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
  const deckWarnings = useSyncStatusStore((state) => state.deckWarnings);
  const favorites = useSettingsStore((s) => s.favoriteBoards);
  const recents = useSettingsStore((s) => s.recentBoards);
  const toggleFavorite = useSettingsStore((s) => s.toggleFavoriteBoard);
  const jiraState = useJiraSessionStore((s) => s.state);
  const jiraCredentials = useJiraCredentials();
  const imageHeaders = useMemo(
    () => (jiraCredentials ? jiraImageHeaders(jiraCredentials) : undefined),
    [jiraCredentials]
  );

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
  const recent = recents.flatMap((ref) => byRef.get(ref) ?? []).slice(0, 3);
  const jiraBoards = filtered.filter((board) => board.source === 'jira');
  const deckBoards = filtered.filter((board) => board.source === 'deck');
  const bothSources = jiraBoards.length > 0 && deckBoards.length > 0;

  const deckNeedsAccount = needsCalDavAccount(summaries.deckError);
  const noBoards = summaries.boards.length === 0;

  function open(board: BoardSummary) {
    haptics.tap();
    router.push({ pathname: '/deck/board/[ref]', params: { ref: board.ref } });
  }

  const header = (
    <View style={{ paddingTop: Platform.OS === 'android' ? insets.top + 16 : 8, gap: 16 }}>
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
    </View>
  );

  if (summaries.isLoading && noBoards) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <LoadingState message="Loading boards…" subtitle="Syncing Deck and Jira" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: IOS ? grouped.screen : colors.bg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
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

        {jiraState.status === 'expired' ? (
          <Notice
            icon="jira"
            text="Jira needs a new API token."
            action="Fix"
            onPress={() => router.push('/settings/jira')}
          />
        ) : null}
        {summaries.jiraError && jiraState.status === 'connected' ? (
          <Notice
            icon="cloud-alert-outline"
            text={summaries.jiraError instanceof Error ? summaries.jiraError.message : 'Could not load Jira boards.'}
            action="Retry"
            onPress={() => summaries.refetch()}
          />
        ) : null}
        {summaries.deckError && !deckNeedsAccount ? (
          <Notice
            icon="cloud-alert-outline"
            text="Deck boards could not load. Check that your Nextcloud server is reachable."
            action="Retry"
            onPress={() => summaries.refetch()}
          />
        ) : null}
        {deckWarnings.length > 0 && !summaries.deckError ? (
          <Notice icon="cloud-alert-outline" text={deckWarnings[0]} action="Retry" onPress={() => summaries.refetch()} />
        ) : null}

        {noBoards ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 48 }}>
            <EmptyState
              icon="view-column-outline"
              title="No boards yet"
              subtitle={
                deckNeedsAccount && jiraState.status !== 'connected'
                  ? 'Connect Jira, or a Nextcloud account for Deck, to see your boards here.'
                  : 'Create a Deck board, or connect Jira to bring in your projects.'
              }
              actions={[
                ...(jiraState.status !== 'connected'
                  ? [{ label: 'Connect Jira', onPress: () => router.push('/settings/jira'), variant: 'filled' as const }]
                  : []),
                deckNeedsAccount
                  ? { label: 'Connect Nextcloud', onPress: () => router.push('/settings/account'), variant: 'tonal' as const }
                  : { label: 'New Deck board', onPress: () => router.push('/new-board'), variant: 'tonal' as const },
              ]}
            />
          </View>
        ) : query.trim() ? (
          <BoardGroup
            title={filtered.length === 0 ? 'No boards match' : 'Results'}
            boards={filtered}
            favorites={favorites}
            imageHeaders={imageHeaders}
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
                imageHeaders={imageHeaders}
                onOpen={open}
                onToggleFavorite={toggleFavorite}
              />
            ) : null}
            {recent.length > 0 ? (
              <BoardGroup
                title="Recently viewed"
                boards={recent}
                favorites={favorites}
                imageHeaders={imageHeaders}
                onOpen={open}
                onToggleFavorite={toggleFavorite}
              />
            ) : null}
            {jiraBoards.length > 0 ? (
              <BoardGroup
                title={bothSources ? 'Jira' : 'All boards'}
                boards={jiraBoards}
                favorites={favorites}
                imageHeaders={imageHeaders}
                onOpen={open}
                onToggleFavorite={toggleFavorite}
              />
            ) : null}
            {deckBoards.length > 0 ? (
              <BoardGroup
                title={bothSources ? 'Deck' : 'All boards'}
                boards={deckBoards}
                favorites={favorites}
                imageHeaders={imageHeaders}
                onOpen={open}
                onToggleFavorite={toggleFavorite}
              />
            ) : null}
            {jiraState.status === 'disconnected' ? (
              <Notice
                icon="jira"
                text="Bring in your Jira boards."
                action="Connect Jira"
                onPress={() => router.push('/settings/jira')}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </>
  );
}

function BoardGroup({
  title,
  boards,
  favorites,
  imageHeaders,
  onOpen,
  onToggleFavorite,
}: {
  title: string;
  boards: BoardSummary[];
  favorites: string[];
  imageHeaders?: Record<string, string>;
  onOpen: (board: BoardSummary) => void;
  onToggleFavorite: (ref: string) => void;
}) {
  const { colors } = useTheme();
  const grouped = useSettingsColors();
  if (IOS) {
    // iOS inset-grouped list: one rounded card, hairlines inset to the text.
    return (
      <View style={{ paddingTop: 22, gap: 7 }}>
        <Text style={{ fontSize: 13, color: colors.text2, paddingHorizontal: 16, textTransform: 'uppercase' }}>
          {title}
        </Text>
        <View style={{ backgroundColor: grouped.cell, borderRadius: 26, borderCurve: 'continuous', overflow: 'hidden' }}>
          {boards.map((board, index) => {
            const starredBoard = favorites.includes(board.ref);
            return (
              <View key={board.ref}>
                {index > 0 ? (
                  <View style={{ height: 0.5, marginLeft: 72, backgroundColor: colors.separator }} />
                ) : null}
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
                  <BoardTile board={board} size={42} imageHeaders={imageHeaders} />
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 17, letterSpacing: -0.4, color: colors.text }}>
                      {board.title}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 15, color: colors.text2 }}>
                      {board.subtitle}
                    </Text>
                  </View>
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
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    );
  }
  return (
    <View style={{ paddingTop: 16, gap: 10 }}>
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text2, paddingHorizontal: 4 }}>{title}</Text>
      {/* M3 Expressive segmented list: one card per row, 2dp apart. */}
      <View style={{ gap: 2 }}>
        {boards.map((board, index) => {
          const top = index === 0 ? OUTER_RADIUS : INNER_RADIUS;
          const bottom = index === boards.length - 1 ? OUTER_RADIUS : INNER_RADIUS;
          const starredBoard = favorites.includes(board.ref);
          return (
            <View
              key={board.ref}
              style={{
                overflow: 'hidden',
                backgroundColor: colors.bg2,
                borderTopLeftRadius: top,
                borderTopRightRadius: top,
                borderBottomLeftRadius: bottom,
                borderBottomRightRadius: bottom,
              }}>
              <Pressable
                onPress={() => onOpen(board)}
                accessibilityRole="button"
                accessibilityLabel={`${board.title}, ${board.subtitle}`}
                android_ripple={{ color: colors.separator }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 16,
                  minHeight: 80,
                  paddingLeft: 20,
                  paddingRight: 8,
                  opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1,
                })}>
                <BoardTile board={board} imageHeaders={imageHeaders} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ fontSize: 17, color: colors.text }}>
                    {board.title}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 14, color: colors.text2 }}>
                    {board.subtitle}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    haptics.toggle(!starredBoard);
                    onToggleFavorite(board.ref);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={starredBoard ? `Unstar ${board.title}` : `Star ${board.title}`}
                  hitSlop={4}
                  style={({ pressed }) => ({
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: pressed ? colors.bg3 : 'transparent',
                  })}>
                  <MaterialCommunityIcons
                    name={starredBoard ? 'star' : 'star-outline'}
                    size={24}
                    color={starredBoard ? colors.yellow : colors.text2}
                  />
                </Pressable>
              </Pressable>
            </View>
          );
        })}
      </View>
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
  );
}

/** One-line status with a single text action. */
function Notice({
  icon,
  text,
  action,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  text: string;
  action: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-3" style={{ paddingTop: 16, paddingHorizontal: 4, minHeight: 48 }}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.text2} />
      <Text numberOfLines={2} style={{ flex: 1, fontSize: 14, color: colors.text2 }}>
        {text}
      </Text>
      <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>{action}</Text>
      </Pressable>
    </View>
  );
}
