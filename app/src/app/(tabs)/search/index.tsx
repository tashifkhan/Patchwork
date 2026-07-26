import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, SectionList } from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { FuseResultMatch } from 'fuse.js';

import { useTheme } from '@/components/theme/context';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingBar, LoadingSpinner } from '@/components/ui/loading';
import { useAllDeckCards, useDeckBoards } from '@/hooks/use-deck';
import { useGitHubIssues } from '@/hooks/use-github';
import { useTasks } from '@/hooks/use-tasks';
import { buildSearchNodes, createSearchIndex, type SearchNode } from '@/lib/search';
import {
  useFloatingTabBar,
  useTabBarContentPadding,
  useTabBarMinimizeOnScroll,
} from '@/lib/tab-bar';
import { useSettingsStore } from '@/stores/settings-store';
import { useTabBarChromeStore } from '@/stores/tab-bar-chrome-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

const RECENTS_KEY = 'search:recents';
const MAX_RECENTS = 6;

type NodeType = SearchNode['type'];
type FilterValue = 'all' | NodeType;

const TYPE_META: Record<
  NodeType,
  { label: string; plural: string; mdIcon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; accentKey: 'accent' | 'purple' | 'green' | 'orange' }
> = {
  task: {
    label: 'Task',
    plural: 'Tasks',
    mdIcon: 'checkbox-marked-circle-outline',
    accentKey: 'accent',
  },
  subtask: {
    label: 'Subtask',
    plural: 'Subtasks',
    mdIcon: 'subdirectory-arrow-right',
    accentKey: 'purple',
  },
  'deck-card': {
    label: 'Deck card',
    plural: 'Deck cards',
    mdIcon: 'card-text-outline',
    accentKey: 'green',
  },
  'github-issue': {
    label: 'GitHub issue',
    plural: 'GitHub issues',
    mdIcon: 'github',
    accentKey: 'orange',
  },
};

const SECTION_ORDER: NodeType[] = ['task', 'subtask', 'deck-card', 'github-issue'];

interface ResultRow {
  node: SearchNode;
  matches?: readonly FuseResultMatch[];
}

export default function SearchScreen() {
  const { colors } = useTheme();
  const floatingTabBar = useFloatingTabBar();
  const onTabBarScroll = useTabBarMinimizeOnScroll();
  const contentBottom = useTabBarContentPadding(48);
  const floatingQuery = useTabBarChromeStore((s) => s.floatingSearchQuery);
  const setFloatingQuery = useTabBarChromeStore((s) => s.setFloatingSearchQuery);
  const [localQuery, setLocalQuery] = useState('');
  // When the iOS-style floating bar is on, the search field lives in the tab bar.
  const query = floatingTabBar ? floatingQuery : localQuery;
  const setQuery = floatingTabBar ? setFloatingQuery : setLocalQuery;
  const [filter, setFilter] = useState<FilterValue>('all');
  const [recents, setRecents] = useState<string[]>([]);
  // Defer deck indexing until the search tab has settled — avoids main-thread
  // ANRs when opening Search with many boards.
  const [indexDeck, setIndexDeck] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const tasksQuery = useTasks();
  const boardsQuery = useDeckBoards();
  const boards = useMemo(
    () => (indexDeck ? (boardsQuery.data ?? []) : []),
    [indexDeck, boardsQuery.data]
  );
  const deckCardsQuery = useAllDeckCards(boards);

  const githubRepositories = useSettingsStore((s) => s.githubRepositories);
  const githubIssuesQuery = useGitHubIssues();

  useEffect(() => {
    const t = setTimeout(() => setIndexDeck(true), 350);
    return () => clearTimeout(t);
  }, []);

  const nodes = useMemo(
    () =>
      buildSearchNodes(
        tasksQuery.data ?? [],
        deckCardsQuery.data,
        githubRepositories.length > 0 ? githubIssuesQuery.data?.issues : undefined
      ),
    [tasksQuery.data, deckCardsQuery.data, githubRepositories.length, githubIssuesQuery.data?.issues]
  );
  const fuse = useMemo(() => createSearchIndex(nodes), [nodes]);

  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setRecents(parsed.slice(0, MAX_RECENTS));
        } catch {
          // ignore
        }
      })
      .catch(() => {});
  }, []);

  const persistRecent = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setRecents((prev) => {
      const next = [trimmed, ...prev.filter((r) => r.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        MAX_RECENTS
      );
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    AsyncStorage.removeItem(RECENTS_KEY).catch(() => {});
  }, []);

  const allResults = useMemo<ResultRow[]>(() => {
    const trimmed = deferredQuery.trim();
    if (!trimmed) return [];
    // Cap results so fuse + render stays snappy on large indexes.
    return fuse.search(trimmed, { limit: 48 }).map((r) => ({ node: r.item, matches: r.matches }));
  }, [fuse, deferredQuery]);

  const counts = useMemo(() => {
    const c: Record<NodeType, number> = { task: 0, subtask: 0, 'deck-card': 0, 'github-issue': 0 };
    for (const r of allResults) c[r.node.type] += 1;
    return c;
  }, [allResults]);

  const sections = useMemo(() => {
    const filtered = filter === 'all' ? allResults : allResults.filter((r) => r.node.type === filter);
    const grouped: Record<NodeType, ResultRow[]> = {
      task: [],
      subtask: [],
      'deck-card': [],
      'github-issue': [],
    };
    for (const r of filtered) grouped[r.node.type].push(r);
    return SECTION_ORDER.filter((t) => grouped[t].length > 0).map((t) => ({
      type: t,
      title: TYPE_META[t].plural,
      data: grouped[t],
    }));
  }, [allResults, filter]);

  const suggestedTags = useMemo(() => {
    const tally = new Map<string, number>();
    for (const n of nodes) {
      for (const t of n.tags) {
        if (!t) continue;
        tally.set(t, (tally.get(t) ?? 0) + 1);
      }
    }
    return Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => t);
  }, [nodes]);

  const openNode = useCallback(
    (node: SearchNode) => {
      persistRecent(deferredQuery);
      if (node.type === 'deck-card') {
        if (node.boardId != null && node.stackId != null && node.cardId != null) {
          router.push({
            pathname: '/deck/card/[cardId]',
            params: {
              boardId: String(node.boardId),
              stackId: String(node.stackId),
              cardId: String(node.cardId),
            },
          });
        } else {
          router.push('/deck');
        }
      } else if (node.type === 'github-issue') {
        if (node.githubRepo && node.githubIssueNumber != null) {
          const issueId = node.id.startsWith('github-issue:')
            ? node.id.slice('github-issue:'.length)
            : node.id;
          router.push({
            pathname: '/github-issue/[id]',
            params: {
              id: issueId,
              repo: node.githubRepo,
              number: String(node.githubIssueNumber),
            },
          });
        }
      } else if (node.taskUid) {
        router.push({
          pathname: '/task/[uid]',
          params: { uid: node.taskUid },
        });
      }
    },
    [deferredQuery, persistRecent]
  );

  const totalResults = allResults.length;
  const hasQuery = deferredQuery.trim().length > 0;
  const isIndexing =
    tasksQuery.isLoading ||
    (indexDeck && (boardsQuery.isLoading || deckCardsQuery.isLoading));

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Search',
          headerLargeTitle: false,
          headerSearchBarOptions:
            Platform.OS === 'ios'
              ? {
                  placeholder: 'Search tasks, cards, issues',
                  onChangeText: (e) => setQuery(e.nativeEvent.text),
                  hideWhenScrolling: false,
                  obscureBackground: false,
                }
              : undefined,
        }}
      />
      <SectionList
        style={{ flex: 1, backgroundColor: colors.bg }}
        sections={sections}
        keyExtractor={(item) => item.node.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        scrollEventThrottle={16}
        onScroll={onTabBarScroll}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: contentBottom,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View className="gap-3 pb-1 pt-2">
            {/* Inline field only when not using the floating iOS-style search pill. */}
            {Platform.OS !== 'ios' && !floatingTabBar ? (
              <View
                className="flex-row items-center rounded-full px-4"
                style={{
                  backgroundColor: colors.bg2,
                  minHeight: 52,
                  borderCurve: 'continuous',
                }}>
                <MaterialCommunityIcons name="magnify" size={22} color={colors.text2} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search tasks, cards, issues"
                  placeholderTextColor={colors.text3}
                  returnKeyType="search"
                  onSubmitEditing={() => persistRecent(query)}
                  className="text-sf-text flex-1 px-3 py-3 text-base"
                  style={{ includeFontPadding: false }}
                />
                {query ? (
                  <Pressable
                    onPress={() => setQuery('')}
                    hitSlop={12}
                    accessibilityLabel="Clear search"
                    style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialCommunityIcons name="close-circle" size={20} color={colors.text2} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {isIndexing ? (
              <View className="gap-1.5 px-1">
                <View className="flex-row items-center gap-2">
                  <LoadingSpinner size={16} />
                  <Text className="text-sf-text-2 text-xs">Indexing your content…</Text>
                </View>
                <LoadingBar />
              </View>
            ) : null}

            {hasQuery ? (
              <FilterBar
                filter={filter}
                counts={counts}
                total={totalResults}
                onChange={setFilter}
              />
            ) : null}

            {hasQuery && totalResults > 0 ? (
              <Text className="text-sf-text-3 px-1 text-xs font-semibold uppercase tracking-wide">
                {totalResults} {totalResults === 1 ? 'match' : 'matches'}
              </Text>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) =>
          hasQuery ? (
            <View className="flex-row items-center justify-between pb-2 pl-1 pt-4">
              <Text className="text-sf-text text-base font-semibold">{section.title}</Text>
              <Text
                className="text-sf-text-3 text-xs"
                style={{ fontVariant: ['tabular-nums'] }}>
                {section.data.length}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          return (
            <ResultRowView
              row={item}
              onPress={openNode}
              isFirst={isFirst}
              isLast={isLast}
            />
          );
        }}
        ListEmptyComponent={
          hasQuery ? (
            <EmptyResults query={deferredQuery} onClear={() => setQuery('')} />
          ) : (
            <EmptyIdle
              recents={recents}
              suggestedTags={suggestedTags}
              onPickRecent={(q) => setQuery(q)}
              onPickTag={(t) => setQuery(t)}
              onClearRecents={clearRecents}
              totalNodes={nodes.length}
              isIndexing={isIndexing}
            />
          )
        }
      />
    </>
  );
}

function FilterBar({
  filter,
  counts,
  total,
  onChange,
}: {
  filter: FilterValue;
  counts: Record<NodeType, number>;
  total: number;
  onChange: (f: FilterValue) => void;
}) {
  const { colors } = useTheme();
  const items: { value: FilterValue; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: total },
    { value: 'task', label: 'Tasks', count: counts.task },
    { value: 'subtask', label: 'Subtasks', count: counts.subtask },
    { value: 'deck-card', label: 'Cards', count: counts['deck-card'] },
    { value: 'github-issue', label: 'Issues', count: counts['github-issue'] },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
      {items.map((it) => {
        const selected = filter === it.value;
        const disabled = it.value !== 'all' && it.count === 0;
        return (
          <Pressable
            key={it.value}
            disabled={disabled}
            onPress={() => onChange(it.value)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : disabled ? 0.35 : 1,
            })}>
            <View
              className="flex-row items-center gap-1.5 rounded-full px-3.5 py-2"
              style={{
                minHeight: 36,
                backgroundColor: selected ? colors.primaryContainer : colors.bg2,
                borderCurve: 'continuous',
              }}>
              <Text
                className="text-sm font-semibold"
                style={{ color: selected ? colors.onPrimaryContainer : colors.text }}>
                {it.label}
              </Text>
              <Text
                className="text-xs"
                style={{
                  color: selected ? colors.onPrimaryContainer : colors.text3,
                  fontVariant: ['tabular-nums'],
                  opacity: 0.85,
                }}>
                {it.count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ResultRowView({
  row,
  onPress,
  isFirst,
  isLast,
}: {
  row: ResultRow;
  onPress: (n: SearchNode) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { colors } = useTheme();
  const meta = TYPE_META[row.node.type];
  const tint =
    meta.accentKey === 'purple'
      ? colors.purple
      : meta.accentKey === 'green'
        ? colors.green
        : meta.accentKey === 'orange'
          ? colors.orange
          : colors.accent;

  const titleMatch = row.matches?.find((m) => m.key === 'title');
  const descMatch = row.matches?.find((m) => m.key === 'descriptionText');
  const snippet = makeSnippet(row.node.descriptionText, descMatch);

  return (
    <Pressable
      onPress={() => onPress(row.node)}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => ({ opacity: pressed && Platform.OS !== 'android' ? 0.7 : 1 })}>
      <View
        className="flex-row items-center gap-3 px-3.5 py-3.5"
        style={{
          backgroundColor: colors.bg2,
          borderTopLeftRadius: isFirst ? 20 : 0,
          borderTopRightRadius: isFirst ? 20 : 0,
          borderBottomLeftRadius: isLast ? 20 : 0,
          borderBottomRightRadius: isLast ? 20 : 0,
          borderCurve: 'continuous',
          borderBottomWidth: isLast ? 0 : StyleSheetHairline,
          borderBottomColor: colors.separator,
          minHeight: 64,
        }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: `${tint}22`,
          }}>
          <MaterialCommunityIcons name={meta.mdIcon} size={20} color={tint} />
        </View>

        <View className="flex-1 gap-0.5">
          <HighlightedText
            text={row.node.title}
            indices={titleMatch?.indices ?? []}
            tint={tint}
            weight="600"
            numberOfLines={1}
          />

          <View className="flex-row items-center gap-1">
            <Text className="text-xs font-semibold uppercase" style={{ color: tint, letterSpacing: 0.4 }}>
              {meta.label}
            </Text>
            <Text className="text-sf-text-3 text-xs">·</Text>
            <Text numberOfLines={1} className="text-sf-text-2 flex-1 text-xs">
              {row.node.parentTitle ? `${row.node.parentTitle} · ` : ''}
              {row.node.listName}
            </Text>
          </View>

          {snippet ? (
            <Text numberOfLines={2} className="text-sf-text-2 mt-0.5 text-[13px]" style={{ lineHeight: 18 }}>
              {snippet}
            </Text>
          ) : null}

          {row.node.tags.length > 0 ? (
            <View className="mt-1.5 flex-row flex-wrap gap-1.5">
              {row.node.tags.slice(0, 4).map((t) => (
                <View
                  key={t}
                  className="rounded-full px-2 py-0.5"
                  style={{ backgroundColor: `${tint}1f` }}>
                  <Text className="text-[11px] font-medium" style={{ color: tint }}>
                    {t}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text3} />
      </View>
    </Pressable>
  );
}

const StyleSheetHairline = Platform.OS === 'android' ? 0.5 : 0.33;

function HighlightedText({
  text,
  indices,
  tint,
  weight,
  numberOfLines,
}: {
  text: string;
  indices: readonly [number, number][];
  tint: string;
  weight?: string;
  numberOfLines?: number;
}) {
  if (!indices || indices.length === 0) {
    return (
      <Text
        numberOfLines={numberOfLines}
        className="text-sf-text text-[15px]"
        style={{ fontWeight: weight as never }}>
        {text}
      </Text>
    );
  }

  const ranges = [...indices].sort((a, b) => a[0] - b[0]);
  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false });
    parts.push({ text: text.slice(start, end + 1), hit: true });
    cursor = end + 1;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });

  return (
    <Text
      numberOfLines={numberOfLines}
      className="text-sf-text text-[15px]"
      style={{ fontWeight: weight as never }}>
      {parts.map((p, i) =>
        p.hit ? (
          <Text key={i} style={{ color: tint, backgroundColor: `${tint}26`, fontWeight: '700' }}>
            {p.text}
          </Text>
        ) : (
          <Text key={i}>{p.text}</Text>
        )
      )}
    </Text>
  );
}

function makeSnippet(text: string, match?: FuseResultMatch): string {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!match || !match.indices || match.indices.length === 0) {
    return flat.length > 120 ? flat.slice(0, 117) + '…' : flat;
  }
  const [start] = match.indices[0];
  const windowStart = Math.max(0, start - 24);
  const windowEnd = Math.min(flat.length, start + 96);
  let out = flat.slice(windowStart, windowEnd);
  if (windowStart > 0) out = '…' + out;
  if (windowEnd < flat.length) out = out + '…';
  return out;
}

function EmptyResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyState
      icon="magnify-close"
      title="No matches"
      subtitle={`Nothing matched “${query}”. Try another keyword, tag, or list name.`}
      actions={[{ label: 'Clear search', onPress: onClear, variant: 'tonal' }]}
    />
  );
}

function EmptyIdle({
  recents,
  suggestedTags,
  onPickRecent,
  onPickTag,
  onClearRecents,
  totalNodes,
  isIndexing,
}: {
  recents: string[];
  suggestedTags: string[];
  onPickRecent: (q: string) => void;
  onPickTag: (t: string) => void;
  onClearRecents: () => void;
  totalNodes: number;
  isIndexing: boolean;
}) {
  const { colors } = useTheme();
  const showRecents = recents.length > 0;
  const showTags = suggestedTags.length > 0;

  return (
    <View className="gap-6 pt-2">
      <View className="items-center gap-3 px-4 pt-6">
        <View
          className="h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.primaryContainer }}>
          <MaterialCommunityIcons name="magnify" size={36} color={colors.onPrimaryContainer} />
        </View>
        <Text className="text-sf-text text-center text-xl font-bold">Search everything</Text>
        <Text className="text-sf-text-2 text-center text-sm" style={{ lineHeight: 20, maxWidth: 300 }}>
          {isIndexing
            ? 'Building your search index…'
            : totalNodes > 0
              ? `Look across ${totalNodes.toLocaleString()} items — tasks, subtasks, Deck cards, and issues.`
              : 'Find tasks, cards, and issues by title, tag, or list once you have some content.'}
        </Text>
      </View>

      {/* Quick destinations */}
      <View className="gap-2">
        <Text className="text-sf-text-3 px-1 text-xs font-semibold uppercase tracking-wide">
          Browse
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <QuickLink
            icon="checkbox-marked-circle-outline"
            label="Tasks"
            onPress={() => router.push('/(tabs)/(tasks)')}
          />
          <QuickLink
            icon="view-column-outline"
            label="Boards"
            onPress={() => router.push('/(tabs)/deck')}
          />
          <QuickLink
            icon="cog-outline"
            label="Settings"
            onPress={() => router.push('/(tabs)/settings')}
          />
        </View>
      </View>

      {showRecents ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-sf-text-3 text-xs font-semibold uppercase tracking-wide">
              Recent
            </Text>
            <Pressable
              onPress={onClearRecents}
              hitSlop={10}
              style={{ minHeight: 32, justifyContent: 'center' }}>
              <Text className="text-sf-blue text-xs font-semibold">Clear</Text>
            </Pressable>
          </View>
          <View
            className="overflow-hidden rounded-3xl"
            style={{ backgroundColor: colors.bg2, borderCurve: 'continuous' }}>
            {recents.map((r, i) => (
              <Pressable
                key={r + i}
                onPress={() => onPickRecent(r)}
                android_ripple={{ color: colors.separator }}
                style={({ pressed }) => ({
                  opacity: pressed && Platform.OS !== 'android' ? 0.7 : 1,
                  minHeight: 52,
                })}>
                <View
                  className="flex-row items-center gap-3 px-4 py-3.5"
                  style={{
                    borderBottomWidth: i === recents.length - 1 ? 0 : StyleSheetHairline,
                    borderBottomColor: colors.separator,
                  }}>
                  <MaterialCommunityIcons name="history" size={20} color={colors.text2} />
                  <Text className="text-sf-text flex-1 text-[15px]">{r}</Text>
                  <MaterialCommunityIcons name="arrow-top-left" size={18} color={colors.text3} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {showTags ? (
        <View className="gap-2">
          <Text className="text-sf-text-3 px-1 text-xs font-semibold uppercase tracking-wide">
            Popular tags
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {suggestedTags.map((t) => (
              <Pressable
                key={t}
                onPress={() => onPickTag(t)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                <View
                  className="rounded-full px-3.5 py-2"
                  style={{
                    backgroundColor: colors.bg2,
                    minHeight: 36,
                    borderCurve: 'continuous',
                  }}>
                  <Text className="text-sf-text text-sm font-medium">#{t}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function QuickLink({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, flexGrow: 1, minWidth: '30%' })}>
      <View
        className="items-center gap-2 rounded-3xl py-4"
        style={{
          backgroundColor: colors.bg2,
          borderCurve: 'continuous',
          minHeight: 88,
        }}>
        <View
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.primaryContainer }}>
          <MaterialCommunityIcons name={icon} size={22} color={colors.onPrimaryContainer} />
        </View>
        <Text className="text-sf-text text-sm font-semibold">{label}</Text>
      </View>
    </Pressable>
  );
}
