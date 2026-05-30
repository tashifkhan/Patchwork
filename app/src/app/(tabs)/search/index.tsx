import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, SectionList } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { FuseResultMatch } from 'fuse.js';

import { Icon } from '@/components/ui/icon';
import { useAllDeckCards, useDeckBoards } from '@/hooks/use-deck';
import { useTasks } from '@/hooks/use-tasks';
import { buildSearchNodes, createSearchIndex, type SearchNode } from '@/lib/search';
import { ScrollView, Text, TextInput, View, useCSSVariable } from '@/tw';

const RECENTS_KEY = 'search:recents';
const MAX_RECENTS = 6;

type NodeType = SearchNode['type'];
type FilterValue = 'all' | NodeType;

const TYPE_META: Record<
  NodeType,
  { label: string; plural: string; iosIcon: string; mdIcon: string; tintVar: string }
> = {
  task: {
    label: 'Task',
    plural: 'Tasks',
    iosIcon: 'checklist',
    mdIcon: 'checkbox-marked-circle-outline',
    tintVar: '--sf-blue',
  },
  subtask: {
    label: 'Subtask',
    plural: 'Subtasks',
    iosIcon: 'arrow.turn.down.right',
    mdIcon: 'subdirectory-arrow-right',
    tintVar: '--sf-purple',
  },
  'deck-card': {
    label: 'Deck card',
    plural: 'Deck cards',
    iosIcon: 'rectangle.split.3x1',
    mdIcon: 'card-text-outline',
    tintVar: '--sf-text-2',
  },
};

const SECTION_ORDER: NodeType[] = ['task', 'subtask', 'deck-card'];

interface ResultRow {
  node: SearchNode;
  matches?: readonly FuseResultMatch[];
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [recents, setRecents] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(query);

  const textSecondary = useCSSVariable('--sf-text-2') as string;
  const textTertiary = (useCSSVariable('--sf-text-3') as string) ?? textSecondary;
  const bg2 = useCSSVariable('--sf-bg-2') as string;
  const separator = useCSSVariable('--sf-separator') as string;

  const tasksQuery = useTasks();
  const boardsQuery = useDeckBoards();
  const deckCards = useAllDeckCards(boardsQuery.data ?? []);

  const nodes = useMemo(
    () => buildSearchNodes(tasksQuery.data ?? [], deckCards),
    [tasksQuery.data, deckCards]
  );
  const fuse = useMemo(() => createSearchIndex(nodes), [nodes]);

  // Load recent searches
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

  // All results (unfiltered by type) — so we can count per type.
  const allResults = useMemo<ResultRow[]>(() => {
    const trimmed = deferredQuery.trim();
    if (!trimmed) return [];
    return fuse.search(trimmed, { limit: 80 }).map((r) => ({ node: r.item, matches: r.matches }));
  }, [fuse, deferredQuery]);

  const counts = useMemo(() => {
    const c: Record<NodeType, number> = { task: 0, subtask: 0, 'deck-card': 0 };
    for (const r of allResults) c[r.node.type] += 1;
    return c;
  }, [allResults]);

  const sections = useMemo(() => {
    const filtered = filter === 'all' ? allResults : allResults.filter((r) => r.node.type === filter);
    const grouped: Record<NodeType, ResultRow[]> = { task: [], subtask: [], 'deck-card': [] };
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
        router.push('/deck');
      } else if (node.taskUid) {
        router.push(`/task/${encodeURIComponent(node.taskUid)}`);
      }
    },
    [deferredQuery, persistRecent]
  );

  const totalResults = allResults.length;
  const hasQuery = deferredQuery.trim().length > 0;

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions:
            Platform.OS === 'ios'
              ? {
                  placeholder: 'Search tasks, subtasks, cards',
                  onChangeText: (e) => setQuery(e.nativeEvent.text),
                  hideWhenScrolling: false,
                  obscureBackground: false,
                }
              : undefined,
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.node.id}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 4 }}
        ListHeaderComponent={
          <View className="gap-3">
            {Platform.OS !== 'ios' ? (
              <View className="pt-3">
                <View
                  className="bg-sf-bg-2 flex-row items-center rounded-2xl px-3.5"
                  style={{ borderCurve: 'continuous' }}>
                  <MaterialCommunityIcons name="magnify" size={20} color={textSecondary} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search tasks, subtasks, cards"
                    placeholderTextColor={textSecondary}
                    returnKeyType="search"
                    onSubmitEditing={() => persistRecent(query)}
                    className="text-sf-text flex-1 px-2.5 py-3 text-base"
                    style={{ includeFontPadding: false }}
                  />
                  {query ? (
                    <Pressable onPress={() => setQuery('')} hitSlop={8}>
                      <MaterialCommunityIcons name="close-circle" size={18} color={textSecondary} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            {hasQuery ? (
              <FilterBar filter={filter} counts={counts} total={totalResults} onChange={setFilter} />
            ) : null}

            {hasQuery && totalResults > 0 ? (
              <Text
                className="text-sf-text-3 px-1 pt-1 text-xs uppercase"
                style={{ letterSpacing: 1.2 }}>
                {totalResults} {totalResults === 1 ? 'match' : 'matches'}
              </Text>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) =>
          hasQuery ? (
            <View className="flex-row items-center justify-between pb-2 pl-1 pt-5">
              <Text className="text-sf-text text-base font-semibold">{section.title}</Text>
              <Text
                className="text-sf-text-3 text-xs"
                style={{ fontVariant: ['tabular-nums'], letterSpacing: 0.6 }}>
                {section.data.length}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          return (
            <Animated.View entering={FadeInDown.duration(220).delay(Math.min(index * 24, 240))}>
              <ResultRowView
                row={item}
                onPress={openNode}
                isFirst={isFirst}
                isLast={isLast}
                bg2={bg2}
                separator={separator}
                textSecondary={textSecondary}
                textTertiary={textTertiary}
              />
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          hasQuery ? (
            <EmptyResults query={deferredQuery} textSecondary={textSecondary} />
          ) : (
            <EmptyIdle
              recents={recents}
              suggestedTags={suggestedTags}
              onPickRecent={(q) => setQuery(q)}
              onPickTag={(t) => setQuery(t)}
              onClearRecents={clearRecents}
              totalNodes={nodes.length}
              textSecondary={textSecondary}
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
  const items: { value: FilterValue; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: total },
    { value: 'task', label: 'Tasks', count: counts.task },
    { value: 'subtask', label: 'Subtasks', count: counts.subtask },
    { value: 'deck-card', label: 'Cards', count: counts['deck-card'] },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-1 py-1">
      {items.map((it) => {
        const selected = filter === it.value;
        const disabled = it.value !== 'all' && it.count === 0;
        return (
          <Pressable
            key={it.value}
            disabled={disabled}
            onPress={() => onChange(it.value)}
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : disabled ? 0.4 : 1 })}>
            <View
              className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                selected ? 'bg-sf-blue' : 'bg-sf-bg-2'
              }`}
              style={{ borderCurve: 'continuous' }}>
              <Text
                className={`text-sm ${selected ? 'text-sf-on-accent' : 'text-sf-text'}`}
                style={{ fontWeight: selected ? '600' : '500' }}>
                {it.label}
              </Text>
              <Text
                className={`text-xs ${selected ? 'text-sf-on-accent' : 'text-sf-text-3'}`}
                style={{ fontVariant: ['tabular-nums'], opacity: selected ? 0.85 : 1 }}>
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
  bg2,
  separator,
  textSecondary,
  textTertiary,
}: {
  row: ResultRow;
  onPress: (n: SearchNode) => void;
  isFirst: boolean;
  isLast: boolean;
  bg2: string;
  separator: string;
  textSecondary: string;
  textTertiary: string;
}) {
  const meta = TYPE_META[row.node.type];
  const tint = (useCSSVariable(meta.tintVar) as string) || textSecondary;

  const titleMatch = row.matches?.find((m) => m.key === 'title');
  const descMatch = row.matches?.find((m) => m.key === 'descriptionText');
  const snippet = makeSnippet(row.node.descriptionText, descMatch);

  return (
    <Pressable
      onPress={() => onPress(row.node)}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
      <View
        className="bg-sf-bg-2 flex-row items-center gap-3 px-3.5 py-3"
        style={{
          backgroundColor: bg2,
          borderTopLeftRadius: isFirst ? 16 : 0,
          borderTopRightRadius: isFirst ? 16 : 0,
          borderBottomLeftRadius: isLast ? 16 : 0,
          borderBottomRightRadius: isLast ? 16 : 0,
          borderCurve: 'continuous',
          borderBottomWidth: isLast ? 0 : 0.5,
          borderBottomColor: separator,
        }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            borderCurve: 'continuous',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tint + '22',
          }}>
          {Platform.OS === 'ios' ? (
            <Icon name={meta.iosIcon as never} size={18} color={tint} />
          ) : (
            <MaterialCommunityIcons name={meta.mdIcon as never} size={18} color={tint} />
          )}
        </View>

        <View className="flex-1 gap-0.5">
          <HighlightedText
            text={row.node.title}
            indices={titleMatch?.indices ?? []}
            tint={tint}
            className="text-sf-text text-[15px]"
            weight="600"
            numberOfLines={1}
          />

          <View className="flex-row items-center gap-1">
            <Text
              className="text-sf-text-3 text-xs uppercase"
              style={{ letterSpacing: 0.8, color: tint }}>
              {meta.label}
            </Text>
            <Text className="text-sf-text-3 text-xs">·</Text>
            <Text
              numberOfLines={1}
              className="text-sf-text-2 flex-1 text-xs"
              style={{ color: textSecondary }}>
              {row.node.parentTitle ? `${row.node.parentTitle} · ` : ''}
              {row.node.listName}
            </Text>
          </View>

          {snippet ? (
            <Text
              numberOfLines={2}
              className="text-sf-text-2 mt-0.5 text-[13px]"
              style={{ color: textSecondary, lineHeight: 18 }}>
              {snippet}
            </Text>
          ) : null}

          {row.node.tags.length > 0 ? (
            <View className="mt-1.5 flex-row flex-wrap gap-1.5">
              {row.node.tags.slice(0, 4).map((t) => (
                <View
                  key={t}
                  className="rounded-full px-2 py-0.5"
                  style={{ backgroundColor: tint + '1f', borderCurve: 'continuous' }}>
                  <Text className="text-[11px]" style={{ color: tint, fontWeight: '500' }}>
                    {t}
                  </Text>
                </View>
              ))}
              {row.node.tags.length > 4 ? (
                <Text className="text-[11px]" style={{ color: textTertiary }}>
                  +{row.node.tags.length - 4}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {Platform.OS === 'ios' ? (
          <Icon name="chevron.right" size={13} color={textTertiary} />
        ) : (
          <MaterialCommunityIcons name="chevron-right" size={18} color={textTertiary} />
        )}
      </View>
    </Pressable>
  );
}

function HighlightedText({
  text,
  indices,
  tint,
  className,
  weight,
  numberOfLines,
}: {
  text: string;
  indices: readonly [number, number][];
  tint: string;
  className?: string;
  weight?: string;
  numberOfLines?: number;
}) {
  if (!indices || indices.length === 0) {
    return (
      <Text
        numberOfLines={numberOfLines}
        className={className}
        style={{ fontWeight: weight as never }}>
        {text}
      </Text>
    );
  }

  // Merge overlapping/adjacent ranges and sort.
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
      className={className}
      style={{ fontWeight: weight as never }}>
      {parts.map((p, i) =>
        p.hit ? (
          <Text
            key={i}
            style={{ color: tint, backgroundColor: tint + '26', fontWeight: '700' }}>
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

function EmptyResults({ query, textSecondary }: { query: string; textSecondary: string }) {
  return (
    <Animated.View entering={FadeIn.duration(220)} className="items-center gap-3 py-20">
      {Platform.OS === 'ios' ? (
        <Icon name="text.magnifyingglass" size={36} color={textSecondary} />
      ) : (
        <MaterialCommunityIcons name="magnify-close" size={36} color={textSecondary} />
      )}
      <Text className="text-sf-text text-center text-base font-semibold">No matches</Text>
      <Text className="text-sf-text-2 px-8 text-center text-sm" style={{ lineHeight: 20 }}>
        Nothing matched <Text style={{ fontWeight: '600' }}>“{query}”</Text>. Try a different
        keyword, tag, or list name.
      </Text>
    </Animated.View>
  );
}

function EmptyIdle({
  recents,
  suggestedTags,
  onPickRecent,
  onPickTag,
  onClearRecents,
  totalNodes,
  textSecondary,
}: {
  recents: string[];
  suggestedTags: string[];
  onPickRecent: (q: string) => void;
  onPickTag: (t: string) => void;
  onClearRecents: () => void;
  totalNodes: number;
  textSecondary: string;
}) {
  const showRecents = recents.length > 0;
  const showTags = suggestedTags.length > 0;

  return (
    <Animated.View entering={FadeIn.duration(260)} className="gap-7 pt-4">
      <View className="items-center gap-2 pt-6">
        {Platform.OS === 'ios' ? (
          <Icon name="sparkle.magnifyingglass" size={32} color={textSecondary} />
        ) : (
          <MaterialCommunityIcons name="magnify-scan" size={32} color={textSecondary} />
        )}
        <Text className="text-sf-text text-center text-base font-semibold">
          Search everything
        </Text>
        <Text
          className="text-sf-text-2 px-8 text-center text-sm"
          style={{ lineHeight: 20 }}>
          {totalNodes > 0
            ? `Look across ${totalNodes.toLocaleString()} task${totalNodes === 1 ? '' : 's'}, subtasks, and Deck cards by title, tag, or list.`
            : 'Find tasks, subtasks, and Deck cards by title, tag, or list once you have some content.'}
        </Text>
      </View>

      {showRecents ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between px-1">
            <Text
              className="text-sf-text-3 text-xs uppercase"
              style={{ letterSpacing: 1.2 }}>
              Recent
            </Text>
            <Pressable onPress={onClearRecents} hitSlop={8}>
              <Text className="text-sf-blue text-xs font-medium">Clear</Text>
            </Pressable>
          </View>
          <View className="bg-sf-bg-2 overflow-hidden rounded-2xl" style={{ borderCurve: 'continuous' }}>
            {recents.map((r, i) => (
              <Pressable
                key={r + i}
                onPress={() => onPickRecent(r)}
                style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}>
                <View
                  className="flex-row items-center gap-3 px-3.5 py-3"
                  style={{
                    borderBottomWidth: i === recents.length - 1 ? 0 : 0.5,
                    borderBottomColor: textSecondary + '33',
                  }}>
                  {Platform.OS === 'ios' ? (
                    <Icon name="clock.arrow.circlepath" size={16} color={textSecondary} />
                  ) : (
                    <MaterialCommunityIcons name="history" size={18} color={textSecondary} />
                  )}
                  <Text className="text-sf-text flex-1 text-sm">{r}</Text>
                  {Platform.OS === 'ios' ? (
                    <Icon name="arrow.up.left" size={13} color={textSecondary} />
                  ) : (
                    <MaterialCommunityIcons name="arrow-top-left" size={16} color={textSecondary} />
                  )}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {showTags ? (
        <View className="gap-2">
          <Text
            className="text-sf-text-3 px-1 text-xs uppercase"
            style={{ letterSpacing: 1.2 }}>
            Popular tags
          </Text>
          <View className="flex-row flex-wrap gap-2 px-1">
            {suggestedTags.map((t) => (
              <Pressable
                key={t}
                onPress={() => onPickTag(t)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                <View
                  className="bg-sf-bg-2 rounded-full px-3 py-1.5"
                  style={{ borderCurve: 'continuous' }}>
                  <Text className="text-sf-text text-sm">#{t}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}
