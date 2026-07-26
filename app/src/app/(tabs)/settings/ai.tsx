import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Platform, Pressable } from 'react-native';

import { AiProviderIcon } from '@/components/settings/ai-provider-icon';
import {
  RowSeparator,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { LoadingSpinner } from '@/components/ui/loading';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useAiCatalog, useAiKeys } from '@/hooks/use-ai';
import { useTaskLists } from '@/hooks/use-tasks';
import { modelBadges, modelById } from '@/lib/ai-models';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

export default function AiScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';

  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const setAiDefaultListId = useSettingsStore((s) => s.setAiDefaultListId);
  const aiModelSelections = useSettingsStore((s) => s.aiModelSelections);
  const setAiModelSelections = useSettingsStore((s) => s.setAiModelSelections);

  const { providers, base, source, error, fetchedAt, loading, refresh } = useAiCatalog();
  const hasKeys = useAiKeys(providers);

  const listsQuery = useTaskLists();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);

  const totalModels = base.reduce((sum, provider) => sum + provider.models.length, 0);
  const configuredCount = providers.filter((provider) => hasKeys[provider.id]).length;

  function removeSelection(providerId: string, modelId: string) {
    setAiModelSelections(
      aiModelSelections.filter((s) => s.providerId !== providerId || s.modelId !== modelId)
    );
  }

  function moveSelection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= aiModelSelections.length) return;
    const next = [...aiModelSelections];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setAiModelSelections(next);
  }

  return (
    <SettingsScreen>
      {/* Catalog status */}
      <SettingsGroup>
        <View className="gap-3 px-4 py-4">
          <View className="flex-row items-center gap-3">
            <View
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.primaryContainer }}>
              <MaterialCommunityIcons name="brain" size={22} color={colors.onPrimaryContainer} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-sf-text text-base font-semibold">Model catalog</Text>
              <Text className="text-sf-text-2 text-sm" numberOfLines={1}>
                {totalModels.toLocaleString()} models · {sourceLabel(source)}
                {fetchedAt ? ` · ${relativeTime(fetchedAt)}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={refresh}
              disabled={loading}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Refresh model catalog"
              style={({ pressed }) => ({
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || loading ? 0.5 : 1,
              })}>
              {loading ? (
                <LoadingSpinner size={22} />
              ) : (
                <MaterialCommunityIcons name="refresh" size={22} color={colors.accent} />
              )}
            </Pressable>
          </View>

          {error ? (
            <View
              className="flex-row items-start gap-2 rounded-2xl px-3 py-2.5"
              style={{ backgroundColor: `${colors.orange}1A`, borderCurve: 'continuous' }}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={18}
                color={colors.orange}
                style={{ marginTop: 1 }}
              />
              <Text className="text-sf-text-2 flex-1 text-sm">
                {error}. Showing {source === 'cache' ? 'the cached catalog' : 'built-in defaults'} —
                pull refresh to retry.
              </Text>
            </View>
          ) : null}
        </View>
      </SettingsGroup>

      {/* Fallback chain */}
      <SettingsGroup title="Fallback chain">
        {aiModelSelections.length === 0 ? (
          <View className="gap-1 px-4 py-4">
            <Text className="text-sf-text text-base font-semibold">No models selected</Text>
            <Text className="text-sf-text-2 text-sm">
              Open a provider below, save its API key, then pick the models to try. Requests run
              top-to-bottom until one succeeds.
            </Text>
          </View>
        ) : (
          aiModelSelections.map((selection, index) => {
            const provider = providers.find((item) => item.id === selection.providerId);
            const model = modelById(selection, providers);
            const badges = modelBadges(model ?? selection);
            const name = model?.name ?? selection.modelName ?? selection.modelId;
            return (
              <View key={`${selection.providerId}:${selection.modelId}:${index}`}>
                {index > 0 ? <RowSeparator /> : null}
                <View className="flex-row items-center gap-3 px-4 py-3" style={{ minHeight: 56 }}>
                  <View
                    className="h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: colors.accent }}>
                    <Text className="text-sf-on-accent text-xs font-bold">{index + 1}</Text>
                  </View>

                  <View className="flex-1 gap-0.5">
                    <Text className="text-sf-text text-base font-semibold" numberOfLines={1}>
                      {name}
                    </Text>
                    <Text className="text-sf-text-2 text-sm" numberOfLines={1}>
                      {provider?.name ?? selection.providerId}
                      {badges.length > 0 ? ` · ${badges.join(' · ')}` : ''}
                    </Text>
                  </View>

                  <IconButton
                    icon="arrow-up"
                    label={`Move ${name} up`}
                    color={colors.text2}
                    disabled={index === 0}
                    onPress={() => moveSelection(index, -1)}
                  />
                  <IconButton
                    icon="arrow-down"
                    label={`Move ${name} down`}
                    color={colors.text2}
                    disabled={index === aiModelSelections.length - 1}
                    onPress={() => moveSelection(index, 1)}
                  />
                  <IconButton
                    icon="close"
                    label={`Remove ${name}`}
                    color={colors.danger}
                    onPress={() => removeSelection(selection.providerId, selection.modelId)}
                  />
                </View>
              </View>
            );
          })
        )}
      </SettingsGroup>

      {aiModelSelections.length > 0 ? (
        <Text className="text-sf-text-3 -mt-3 px-4 text-sm">
          Models are tried top-to-bottom. Image prompts skip text-only models.
        </Text>
      ) : null}

      {/* Providers */}
      {!isWeb ? (
        <SettingsGroup
          title={
            configuredCount > 0 ? `Providers · ${configuredCount} with keys` : 'Providers'
          }>
          {providers.map((provider, index) => {
            const configured = Boolean(hasKeys[provider.id]);
            const selectedCount = aiModelSelections.filter(
              (s) => s.providerId === provider.id
            ).length;
            const detail = [
              `${provider.models.length} model${provider.models.length === 1 ? '' : 's'}`,
              configured ? 'Key saved' : 'No key',
              selectedCount > 0 ? `${selectedCount} in chain` : null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <View key={provider.id}>
                {index > 0 ? <RowSeparator /> : null}
                <SettingsRow
                  leading={
                    <AiProviderIcon
                      providerId={provider.id}
                      custom={provider.custom}
                      configured={configured}
                    />
                  }
                  title={provider.name}
                  subtitle={detail}
                  onPress={() =>
                    router.push({
                      pathname: '/settings/ai-provider',
                      params: { id: provider.id },
                    })
                  }
                  showChevron
                  trailing={
                    selectedCount > 0 ? (
                      <View
                        className="items-center justify-center rounded-full px-2.5 py-0.5"
                        style={{ backgroundColor: colors.selectionBg, minWidth: 26 }}>
                        <Text
                          className="text-xs font-bold"
                          style={{ color: colors.onSelectionBg }}>
                          {selectedCount}
                        </Text>
                      </View>
                    ) : null
                  }
                />
              </View>
            );
          })}

          <RowSeparator />
          <SettingsRow
            icon="plus"
            iconColor={colors.accent}
            title="Add custom provider"
            subtitle="Any OpenAI-compatible endpoint — llama.cpp, vLLM, LM Studio"
            onPress={() => router.push('/settings/ai-custom-provider')}
            showChevron
          />
        </SettingsGroup>
      ) : null}

      {/* Default list */}
      {lists.length > 0 ? (
        <SettingsGroup title="Default import list">
          <View className="gap-3 px-4 py-4">
            <Text className="text-sf-text-2 text-sm">
              Where AI-generated tasks land unless you pick another list at import time.
            </Text>
            <View className="flex-row flex-wrap items-center gap-2">
              {lists.map((list) => (
                <ToggleChip
                  key={list.id}
                  label={list.name}
                  selected={list.id === aiDefaultListId}
                  onPress={() => setAiDefaultListId(list.id === aiDefaultListId ? null : list.id)}
                />
              ))}
            </View>
          </View>
        </SettingsGroup>
      ) : null}
    </SettingsScreen>
  );
}

/** 44dp icon-only tap target used by the fallback-chain reorder controls. */
function IconButton({
  icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: 36,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.25 : pressed ? 0.6 : 1,
      })}>
      <MaterialCommunityIcons name={icon} size={20} color={color} />
    </Pressable>
  );
}

function sourceLabel(source: 'network' | 'cache' | 'fallback') {
  if (source === 'network') return 'live from models.dev';
  if (source === 'cache') return 'cached catalog';
  return 'offline defaults';
}

function relativeTime(timestamp: number) {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
