import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, SectionList, type TextInput as RNTextInput } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { FuseResultMatch } from 'fuse.js';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TaskList } from '@/api/types';
import { FilterChip } from '@/components/tasks/tag-chip-list';
import { useTheme } from '@/components/theme/context';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingBar, LoadingSpinner } from '@/components/ui/loading';
import { useAllDeckCards, useDeckBoards } from '@/hooks/use-deck';
import { READABLE_MAX_WIDTH } from '@/hooks/use-adaptive-layout';
import { useGitHubIssues } from '@/hooks/use-github';
import { useTaskLists, useTasks } from '@/hooks/use-tasks';
import { haptics } from '@/lib/haptics';
import { buildSearchNodes, createSearchIndex, type SearchNode } from '@/lib/search';
import {
  useFloatingTabBar,
  useTabBarContentPadding,
  useTabBarMinimizeOnScroll,
} from '@/lib/tab-bar';
import { useSettingsStore } from '@/stores/settings-store';
import { useTabBarChromeStore } from '@/stores/tab-bar-chrome-store';
import { useUiStore } from '@/stores/ui-store';
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
  // When the floating navbar is on, the search field lives in the tab bar.
  const query = floatingTabBar ? floatingQuery : localQuery;
  const setQuery = floatingTabBar ? setFloatingQuery : setLocalQuery;
  const [filter, setFilter] = useState<FilterValue>('all');
  const [recents, setRecents] = useState<string[]>([]);
  // Defer deck indexing until the search tab has settled — avoids main-thread
  // ANRs when opening Search with many boards.
  const [indexDeck, setIndexDeck] = useState(false);
  const deferredQuery = useDeferredValue(query);

  // Opening the Search tab means the user wants to type: focus the field and
  // raise the keyboard every time the tab gains focus, not just on first
  // mount (tab screens stay mounted). The short delay lets the tab switch
  // finish; focusing mid-transition is dropped on Android.
  const iosSearchRef = useRef<SearchBarCommands>(null);
  const androidSearchRef = useRef<RNTextInput>(null);
  useFocusEffect(
    useCallback(() => {
      if (floatingTabBar) return; // the floating bar's field autofocuses itself
      const timer = setTimeout(() => {
        if (Platform.OS === 'ios') iosSearchRef.current?.focus();
        else androidSearchRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }, [floatingTabBar])
  );

  const tasksQuery = useTasks();
  const listsQuery = useTaskLists();
  const insets = useSafeAreaInsets();
  const selectedListId = useUiStore((s) => s.selectedListId);
  const selectedTag = useUiStore((s) => s.selectedTag);
  const setSelectedListId = useUiStore((s) => s.setSelectedListId);
  const setSelectedTag = useUiStore((s) => s.setSelectedTag);
  const requestOpenTask = useUiStore((s) => s.requestOpenTask);
  const lists = useMemo(
    () => (listsQuery.data ?? []).filter((list) => !list.is_deck),
    [listsQuery.data]
  );
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
        // Things Quick Find: jump to the Tasks tab and open the to-do in place.
        requestOpenTask(node.taskUid);
        router.navigate('/(tabs)/(tasks)');
      }
    },
    [deferredQuery, persistRecent, requestOpenTask]
  );

  // Quick Find destinations: switching the Tasks tab to a list or a tag.
  const jumpToList = useCallback(
    (listId: string | null) => {
      haptics.selection();
      setSelectedListId(listId);
      setSelectedTag(null);
      router.navigate('/(tabs)/(tasks)');
    },
    [setSelectedListId, setSelectedTag]
  );
  const jumpToTag = useCallback(
    (tag: string) => {
      haptics.selection();
      setSelectedListId(null);
      setSelectedTag(tag);
      router.navigate('/(tabs)/(tasks)');
    },
    [setSelectedListId, setSelectedTag]
  );
  const needle = deferredQuery.trim().toLowerCase();
  const matchingLists = useMemo(
    () => (needle ? lists.filter((l) => l.name.toLowerCase().includes(needle)) : []),
    [lists, needle]
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
          // Android draws its own M3 search bar in place of a title header.
          headerShown: Platform.OS === 'ios',
          headerSearchBarOptions:
            Platform.OS === 'ios'
              ? {
                  ref: iosSearchRef,
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
          // Big screens: results stay at a readable width, centered.
          width: '100%',
          maxWidth: READABLE_MAX_WIDTH,
          alignSelf: 'center',
        }}
        ListHeaderComponent={
          <View className="gap-3 pb-1 pt-2">
            {Platform.OS === 'android' ? (
              floatingTabBar ? (
                <Text
                  className="text-sf-text px-1"
                  style={{ fontSize: 28, fontWeight: '700', paddingTop: insets.top + 12 }}>
                  Search
                </Text>
              ) : (
                <M3SearchBar
                  inputRef={androidSearchRef}
                  value={query}
                  onChangeText={setQuery}
                  onSubmit={() => persistRecent(query)}
                  topInset={insets.top}
                />
              )
            ) : null}

            {hasQuery && matchingLists.length > 0 ? (
              <ListGroup
                title="Lists"
                lists={matchingLists}
                selectedListId={selectedListId}
                onPick={jumpToList}
              />
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
              lists={lists}
              selectedListId={selectedListId}
              selectedTag={selectedTag}
              onPickList={jumpToList}
              onPickTag={jumpToTag}
              onPickRecent={(q) => setQuery(q)}
              onClearRecents={clearRecents}
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
  const items: {
    value: FilterValue;
    label: string;
    count: number;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  }[] = [
    { value: 'all', label: 'All', count: total, icon: 'magnify' },
    { value: 'task', label: 'Tasks', count: counts.task, icon: 'checkbox-blank-outline' },
    { value: 'subtask', label: 'Subtasks', count: counts.subtask, icon: 'subdirectory-arrow-right' },
    { value: 'deck-card', label: 'Cards', count: counts['deck-card'], icon: 'card-text-outline' },
    { value: 'github-issue', label: 'Issues', count: counts['github-issue'], icon: 'github' },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: 2 }}>
      {items
        .filter((it) => it.value === 'all' || it.count > 0)
        .map((it) => (
          <FilterChip
            key={it.value}
            label={it.label}
            icon={it.icon}
            count={it.count}
            selected={filter === it.value}
            onPress={() => onChange(it.value)}
          />
        ))}
    </ScrollView>
  );
}

/**
 * M3 search bar: 56dp full-round container on `surfaceContainerHigh`, leading
 * search icon, trailing clear. Replaces the Android title header on this tab.
 */
function M3SearchBar({
  inputRef,
  value,
  onChangeText,
  onSubmit,
  topInset,
}: {
  inputRef: React.RefObject<RNTextInput | null>;
  value: string;
  onChangeText: (q: string) => void;
  onSubmit: () => void;
  topInset: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingTop: topInset + 8, paddingBottom: 4 }}>
      <View
        className="flex-row items-center"
        style={{
          height: 56,
          borderRadius: 28,
          paddingLeft: 16,
          paddingRight: 4,
          gap: 12,
          backgroundColor: colors.bg3,
        }}>
        <MaterialCommunityIcons name="magnify" size={24} color={colors.text} />
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder="Search tasks, lists, tags"
          placeholderTextColor={colors.text2}
          returnKeyType="search"
          autoCorrect={false}
          onSubmitEditing={onSubmit}
          accessibilityLabel="Search"
          className="text-sf-text flex-1"
          style={{ fontSize: 16, includeFontPadding: false, paddingVertical: 0 }}
        />
        {value ? (
          <Pressable
            onPress={() => onChangeText('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            android_ripple={{ color: colors.separator, borderless: true, radius: 24 }}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="close" size={22} color={colors.text2} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Rounded M3 list group of task lists, each a Quick Find jump target. */
function ListGroup({
  title,
  lists,
  selectedListId,
  onPick,
  includeAll,
}: {
  title: string;
  lists: TaskList[];
  selectedListId: string | null;
  onPick: (listId: string | null) => void;
  includeAll?: boolean;
}) {
  const rows: { id: string | null; name: string; detail?: string }[] = [
    ...(includeAll ? [{ id: null, name: 'All tasks' }] : []),
    ...lists.map((l) => ({ id: l.id, name: l.name, detail: l.account_name })),
  ];
  return (
    <View className="gap-2">
      <SectionLabel>{title}</SectionLabel>
      <GroupCard>
        {rows.map((row, i) => (
          <GroupRow
            key={row.id ?? 'all'}
            icon={row.id == null ? 'tray-full' : 'format-list-bulleted'}
            label={row.name}
            detail={row.detail}
            selected={row.id === selectedListId}
            last={i === rows.length - 1}
            onPress={() => onPick(row.id)}
          />
        ))}
      </GroupCard>
    </View>
  );
}

function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between px-1">
      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>{children}</Text>
      {action}
    </View>
  );
}

function GroupCard({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.bg2,
        borderRadius: 24,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}>
      {children}
    </View>
  );
}

function GroupRow({
  icon,
  label,
  detail,
  selected,
  last,
  trailing,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  detail?: string;
  selected?: boolean;
  last?: boolean;
  trailing?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => ({ opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1 })}>
      <View
        className="flex-row items-center gap-4"
        style={{
          minHeight: 64,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: last ? 0 : StyleSheetHairline,
          borderBottomColor: colors.separator,
        }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: selected ? 12 : 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? colors.accent : colors.primaryContainer,
          }}>
          <MaterialCommunityIcons
            name={icon}
            size={20}
            color={selected ? colors.onAccent : colors.onPrimaryContainer}
          />
        </View>
        <View className="flex-1">
          <Text numberOfLines={1} className="text-sf-text" style={{ fontSize: 16 }}>
            {label}
          </Text>
          {detail ? (
            <Text numberOfLines={1} className="text-sf-text-2" style={{ fontSize: 14 }}>
              {detail}
            </Text>
          ) : null}
        </View>
        {selected ? (
          <MaterialCommunityIcons name="check" size={22} color={colors.accent} />
        ) : trailing ? (
          <MaterialCommunityIcons name={trailing} size={20} color={colors.text3} />
        ) : null}
      </View>
    </Pressable>
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

/**
 * Idle state, modeled on Things' Quick Find: jump straight to a list or a tag,
 * or rerun a recent search. No hero illustration; the destinations are the
 * content.
 */
function EmptyIdle({
  recents,
  suggestedTags,
  lists,
  selectedListId,
  selectedTag,
  onPickList,
  onPickTag,
  onPickRecent,
  onClearRecents,
}: {
  recents: string[];
  suggestedTags: string[];
  lists: TaskList[];
  selectedListId: string | null;
  selectedTag: string | null;
  onPickList: (listId: string | null) => void;
  onPickTag: (tag: string) => void;
  onPickRecent: (q: string) => void;
  onClearRecents: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-6 pt-3">
      <ListGroup
        title="Jump to"
        lists={lists}
        includeAll
        selectedListId={selectedTag ? '__none__' : selectedListId}
        onPick={onPickList}
      />

      {suggestedTags.length > 0 ? (
        <View className="gap-3">
          <SectionLabel>Tags</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {suggestedTags.map((t) => (
              <FilterChip
                key={t}
                label={t}
                selected={selectedTag === t}
                onPress={() => onPickTag(t)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {recents.length > 0 ? (
        <View className="gap-2">
          <SectionLabel
            action={
              <Pressable
                onPress={onClearRecents}
                accessibilityRole="button"
                hitSlop={10}
                style={{ minHeight: 32, justifyContent: 'center' }}>
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>Clear</Text>
              </Pressable>
            }>
            Recent
          </SectionLabel>
          <GroupCard>
            {recents.map((r, i) => (
              <GroupRow
                key={r + i}
                icon="history"
                label={r}
                trailing="arrow-top-left"
                last={i === recents.length - 1}
                onPress={() => onPickRecent(r)}
              />
            ))}
          </GroupCard>
        </View>
      ) : null}
    </View>
  );
}
