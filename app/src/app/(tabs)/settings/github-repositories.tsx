import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, type ViewStyle } from 'react-native';

import type { GitHubRepo } from '@/api/types';
import {
  SETTINGS_IOS,
  SettingsDivider,
  SettingsSearchField,
  SettingsToggleRow,
  useSettingsColors,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { selectionFromRepo, useGitHubRepos } from '@/hooks/use-github';
import { useTabBarContentPadding } from '@/lib/tab-bar';
import { useGitHubSessionStore } from '@/stores/github-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

type RepositoryFilter = 'all' | 'selected' | 'public' | 'private';

const FILTERS: { label: string; value: RepositoryFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Selected', value: 'selected' },
  { label: 'Public', value: 'public' },
  { label: 'Private', value: 'private' },
];

export default function GitHubRepositoriesScreen() {
  const { colors } = useTheme();
  const { screen, cell } = useSettingsColors();
  const bottomPadding = useTabBarContentPadding(40);
  const repositoriesQuery = useGitHubRepos();
  const selections = useSettingsStore((state) => state.githubRepositories);
  const setSelections = useSettingsStore((state) => state.setGitHubRepositories);
  const connection = useGitHubSessionStore((state) => state.state);
  const authenticated = connection.status === 'connected';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RepositoryFilter>('all');

  const repositories = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data?.repositories]
  );
  const selectedNames = useMemo(
    () => new Set(selections.map((selection) => selection.fullName.toLowerCase())),
    [selections]
  );

  useEffect(() => {
    if (repositories.length === 0 || selections.length === 0) return;
    let changed = false;
    const next = selections.map((selection) => {
      const canonical = repositories.find(
        (repository) =>
          repository.id === selection.id ||
          repository.full_name.toLowerCase() === selection.fullName.toLowerCase()
      );
      if (!canonical) return selection;
      const updated = selectionFromRepo(canonical);
      if (
        selection.id !== updated.id ||
        selection.fullName !== updated.fullName ||
        selection.canWriteIssues !== updated.canWriteIssues ||
        selection.visibility !== updated.visibility
      ) {
        changed = true;
        return updated;
      }
      return selection;
    });
    if (changed) setSelections(next);
  }, [repositories, selections, setSelections]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return repositories.filter((repository) => {
      const selected = selectedNames.has(repository.full_name.toLowerCase());
      if (
        query &&
        !repository.full_name.toLowerCase().includes(query) &&
        !(repository.description ?? '').toLowerCase().includes(query)
      ) {
        return false;
      }
      if (filter === 'selected') return selected;
      if (filter === 'private') return repository.private;
      if (filter === 'public') return !repository.private;
      return true;
    });
  }, [repositories, search, filter, selectedNames]);

  const toggleRepository = (repository: GitHubRepo) => {
    const selected = selectedNames.has(repository.full_name.toLowerCase());
    setSelections(
      selected
        ? selections.filter(
            (candidate) =>
              candidate.id !== repository.id &&
              candidate.fullName.toLowerCase() !== repository.full_name.toLowerCase()
          )
        : [...selections, selectionFromRepo(repository)]
    );
  };

  const selectVisible = () => {
    const byName = new Map(
      selections.map((selection) => [selection.fullName.toLowerCase(), selection])
    );
    filtered.forEach((repository) =>
      byName.set(repository.full_name.toLowerCase(), selectionFromRepo(repository))
    );
    setSelections([...byName.values()]);
  };

  const clearVisible = () => {
    const visible = new Set(filtered.map((repository) => repository.full_name.toLowerCase()));
    setSelections(
      selections.filter((selection) => !visible.has(selection.fullName.toLowerCase()))
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: 'GitHub Repositories', headerLargeTitle: false }} />
      <FlatList
        style={{ backgroundColor: screen }}
        data={filtered}
        keyExtractor={(repository) => String(repository.id)}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={repositoriesQuery.isFetching && !repositoriesQuery.isLoading}
            onRefresh={() => repositoriesQuery.refetch()}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: bottomPadding,
          flexGrow: filtered.length === 0 ? 1 : undefined,
        }}
        ListHeaderComponent={
          <View className="gap-3 pb-4">
            <SettingsSearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search repositories"
            />

            {SETTINGS_IOS ? (
              <SegmentedChoice options={FILTERS} value={filter} onChange={setFilter} />
            ) : (
              <View className="flex-row flex-wrap gap-2">
                {(
                  [
                    ['all', 'All'],
                    ['selected', 'Selected'],
                    ['public', 'Public'],
                    ['private', 'Private'],
                  ] as const
                ).map(([id, label]) => (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: filter === id }}
                    onPress={() => setFilter(id)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
                    <View
                      className="rounded-full px-3.5 py-2"
                      style={{
                        backgroundColor:
                          filter === id ? colors.primaryContainer : cell,
                      }}>
                      <Text
                        className="text-sm font-medium"
                        style={{
                          color:
                            filter === id ? colors.onPrimaryContainer : colors.text2,
                        }}>
                        {label}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            <View className="flex-row items-center justify-between gap-3 px-1">
              <Text selectable className="text-sf-text-2 text-sm" style={{ fontVariant: ['tabular-nums'] }}>
                {selections.length} selected
              </Text>
              {authenticated ? (
                <View className="flex-row gap-4">
                  <Pressable
                    accessibilityRole="button"
                    disabled={filtered.length === 0}
                    onPress={selectVisible}>
                    <Text className="text-sf-blue text-sm font-semibold">Select visible</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={filtered.length === 0}
                    onPress={clearVisible}>
                    <Text className="text-sf-blue text-sm font-semibold">Clear visible</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {repositoriesQuery.data?.warnings.map((warning) => (
              <View
                key={`${warning.repository}:${warning.code}`}
                className="flex-row items-start gap-2 rounded-xl p-3"
                style={{ backgroundColor: `${colors.orange}18`, borderCurve: 'continuous' }}>
                <MaterialCommunityIcons name="alert-outline" size={18} color={colors.orange} />
                <Text selectable className="text-sf-text-2 flex-1 text-xs">
                  {warning.repository}: {warning.message}
                </Text>
              </View>
            ))}
          </View>
        }
        renderItem={({ item, index }) => (
          // Rows draw as one grouped list: a card on iOS, segments on Android.
          <View style={segmentStyle(index, filtered.length, cell)}>
            <RepositoryRow
              repository={item}
              selected={selectedNames.has(item.full_name.toLowerCase())}
              onToggle={() => toggleRepository(item)}
            />
          </View>
        )}
        ItemSeparatorComponent={() =>
          Platform.OS === 'android' ? (
            <View style={{ height: 2 }} />
          ) : (
            <View style={{ backgroundColor: cell }}>
              <SettingsDivider />
            </View>
          )
        }
        ListEmptyComponent={
          repositoriesQuery.isLoading ? (
            <LoadingState message="Loading repositories…" fullScreen={false} />
          ) : repositoriesQuery.isError ? (
            <EmptyState
              icon="cloud-alert-outline"
              title="Could not load repositories"
              subtitle={
                repositoriesQuery.error instanceof Error
                  ? repositoriesQuery.error.message
                  : 'Please try again.'
              }
              actions={[
                {
                  label: 'Retry',
                  onPress: () => repositoriesQuery.refetch(),
                  variant: 'filled',
                },
              ]}
            />
          ) : (
            <EmptyState
              icon="source-repository"
              title={search ? 'No matching repositories' : 'No repositories available'}
              subtitle={
                authenticated
                  ? 'Check the repositories granted to the GitHub App.'
                  : 'Add a public repository from the previous screen.'
              }
            />
          )
        }
      />
    </>
  );
}

function RepositoryRow({
  repository,
  selected,
  onToggle,
}: {
  repository: GitHubRepo;
  selected: boolean;
  onToggle: () => void;
}) {
  const unavailable = repository.archived || !repository.has_issues;
  const status = repository.archived
    ? 'Archived'
    : !repository.has_issues
      ? 'Issues are disabled'
      : repository.canWriteIssues
        ? 'Issues read and write'
        : (repository.description ?? 'Issues read-only');
  return (
    <SettingsToggleRow
      title={repository.full_name}
      subtitle={repository.private ? `Private · ${status}` : status}
      value={selected}
      disabled={unavailable}
      onValueChange={onToggle}
    />
  );
}

/** Corner radii for row `index` of `count` in a grouped list. */
function segmentStyle(index: number, count: number, cell: string): ViewStyle {
  const android = Platform.OS === 'android';
  const outer = android ? 24 : 26;
  const inner = android ? 4 : 0;
  const top = index === 0 ? outer : inner;
  const bottom = index === count - 1 ? outer : inner;
  return {
    backgroundColor: cell,
    overflow: 'hidden',
    borderCurve: 'continuous',
    borderTopLeftRadius: top,
    borderTopRightRadius: top,
    borderBottomLeftRadius: bottom,
    borderBottomRightRadius: bottom,
  };
}
