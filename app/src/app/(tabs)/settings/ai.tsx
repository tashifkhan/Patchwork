import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MenuView } from '@expo/ui/community/menu';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Fragment } from 'react';
import { Platform, Pressable } from 'react-native';

import { AiProviderIcon } from '@/components/settings/ai-provider-icon';
import {
  RowSeparator,
  SETTINGS_IOS,
  SettingsDivider,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { LoadingSpinner } from '@/components/ui/loading';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useAiCatalog, useAiKeys } from '@/hooks/use-ai';
import { useTaskLists } from '@/hooks/use-tasks';
import {
  effortLabel,
  modelBadges,
  modelById,
  reasoningChoices,
  type ReasoningEffort,
} from '@/lib/ai-models';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

type ReasoningChoice = ReturnType<typeof reasoningChoices>[number];

/** RelayRoom routing modes: the key's ladder, subscription logins, or stored API keys. */
type RouteMode = 'auto' | 'sub' | 'api';
const ROUTE_LABELS: Record<RouteMode, string> = { auto: 'Auto', sub: 'Subscription', api: 'API key' };

function routeModes(modes: string[] | undefined): RouteMode[] {
  return (['auto', 'sub', 'api'] as const).filter((mode) => modes?.includes(mode));
}

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

  function setReasoningEffort(index: number, effort: ReasoningEffort | null) {
    setAiModelSelections(
      aiModelSelections.map((s, i) =>
        i === index ? { ...s, reasoningEffort: effort ?? undefined } : s
      )
    );
  }

  function setRouteMode(index: number, mode: RouteMode) {
    setAiModelSelections(
      aiModelSelections.map((s, i) => (i === index ? { ...s, routeMode: mode === 'auto' ? undefined : mode } : s))
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
      <SettingsGroup
        footer={
          error
            ? `${error}. Showing ${source === 'cache' ? 'the cached catalog' : 'built-in defaults'}. Refresh to retry.`
            : undefined
        }>
        <SettingsRow
          icon="brain"
          title="Model catalog"
          subtitle={`${totalModels.toLocaleString()} models · ${sourceLabel(source)}${fetchedAt ? ` · ${relativeTime(fetchedAt)}` : ''}`}
          trailing={
            <Pressable
              onPress={refresh}
              disabled={loading}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Refresh model catalog"
              style={({ pressed }) => ({
                minWidth: 36,
                minHeight: 36,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || loading ? 0.5 : 1,
              })}>
              {loading ? (
                <LoadingSpinner size={22} />
              ) : SETTINGS_IOS ? (
                <SymbolView name="arrow.clockwise" size={18} weight="medium" tintColor={colors.accent} />
              ) : (
                <MaterialCommunityIcons name="refresh" size={22} color={colors.accent} />
              )}
            </Pressable>
          }
        />
      </SettingsGroup>

      {/* Fallback chain */}
      <SettingsGroup
        title="Fallback chain"
        footer={
          aiModelSelections.length > 0
            ? 'Models are tried top-to-bottom. Image prompts skip text-only models.'
            : undefined
        }>
        {aiModelSelections.length === 0 ? (
          <SettingsRow
            title="No models selected"
            subtitle="Open a provider below, save its API key, then pick the models to try. Requests run top-to-bottom until one succeeds."
          />
        ) : (
          aiModelSelections.map((selection, index) => {
            const provider = providers.find((item) => item.id === selection.providerId);
            const model = modelById(selection, providers);
            const badges = modelBadges(model ?? selection);
            const name = model?.name ?? selection.modelName ?? selection.modelId;
            // Only the levels this model's provider actually accepts (from
            // models.dev); Auto leaves the provider default.
            const choices = reasoningChoices(model ?? selection);
            const reasoning = choices.length > 0;
            // A level saved before the catalog changed may no longer exist.
            const effort = choices.some((c) => c.value === selection.reasoningEffort)
              ? (selection.reasoningEffort ?? null)
              : null;
            // RelayRoom: which credentials the gateway routes through.
            const modes = routeModes(selection.modes);
            const mode: RouteMode = selection.routeMode ?? 'auto';
            if (SETTINGS_IOS) {
              // iOS: a plain row with its rank tile; reorder, thinking budget and
              // removal live in the native menu behind the ellipsis.
              return (
                <Fragment key={`${selection.providerId}:${selection.modelId}:${index}`}>
                  {index > 0 ? <RowSeparator /> : null}
                  <SettingsRow
                    leading={<RankTile n={index + 1} />}
                    title={name}
                    subtitle={[
                      provider?.name ?? selection.providerId,
                      reasoning ? `Thinking: ${effortLabel(effort)}` : null,
                      modes.length > 1 ? `Route: ${ROUTE_LABELS[mode]}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    trailing={
                      <ChainMenu
                        name={name}
                        choices={choices}
                        effort={effort}
                        first={index === 0}
                        last={index === aiModelSelections.length - 1}
                        onEffort={(value) => setReasoningEffort(index, value)}
                        modes={modes}
                        mode={mode}
                        onMode={(value) => setRouteMode(index, value)}
                        onMove={(direction) => moveSelection(index, direction)}
                        onRemove={() => removeSelection(selection.providerId, selection.modelId)}
                      />
                    }
                  />
                </Fragment>
              );
            }
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
                {modes.length > 1 ? (
                  <View className="gap-2 px-4 pb-3" style={{ paddingLeft: 56 }}>
                    <Text className="text-sf-text-2 text-sm">Route through</Text>
                    <SegmentedChoice
                      options={modes.map((value) => ({ label: ROUTE_LABELS[value], value }))}
                      value={mode}
                      onChange={(value) => setRouteMode(index, value)}
                    />
                  </View>
                ) : null}
                {reasoning ? (
                  <View className="gap-2 px-4 pb-3" style={{ paddingLeft: 56 }}>
                    <Text className="text-sf-text-2 text-sm">Thinking</Text>
                    {choices.length <= 4 ? (
                      <SegmentedChoice
                        options={choices}
                        value={effort}
                        onChange={(value) => setReasoningEffort(index, value)}
                      />
                    ) : (
                      // Too many levels for one segmented row: wrap as chips.
                      <View className="flex-row flex-wrap gap-2">
                        {choices.map((choice) => (
                          <ToggleChip
                            key={choice.value ?? 'auto'}
                            label={choice.label}
                            selected={choice.value === effort}
                            onPress={() => setReasoningEffort(index, choice.value)}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </SettingsGroup>

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
                      // Match the 30pt SF tiles so titles and dividers line up.
                      size={Platform.OS === 'ios' ? 30 : undefined}
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
                    // iOS spells the count out in the subtitle; no badge pill.
                    selectedCount > 0 && !SETTINGS_IOS ? (
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
        SETTINGS_IOS ? (
          // iOS: a checkmark list, like any single choice in Settings.
          <SettingsGroup
            title="Default import list"
            footer="Where AI-generated tasks land unless you pick another list at import time.">
            {lists.map((list, index) => (
              <Fragment key={list.id}>
                {index > 0 ? <SettingsDivider /> : null}
                <SettingsRow
                  title={list.name}
                  selected={list.id === aiDefaultListId}
                  onPress={() => setAiDefaultListId(list.id === aiDefaultListId ? null : list.id)}
                />
              </Fragment>
            ))}
          </SettingsGroup>
        ) : (
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
        )
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

/** Chain position on an accent tile, sized like the iOS settings icons. */
function RankTile({ n }: { n: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accent,
      }}>
      <Text style={{ color: colors.onAccent, fontSize: 15, fontWeight: '700' }}>{n}</Text>
    </View>
  );
}

/** Native iOS menu with the per-model chain actions. */
function ChainMenu({
  name,
  choices,
  effort,
  first,
  last,
  onEffort,
  onMove,
  onRemove,
  modes = [],
  mode = 'auto',
  onMode,
}: {
  modes?: RouteMode[];
  mode?: RouteMode;
  onMode?: (mode: RouteMode) => void;
  name: string;
  choices: ReasoningChoice[];
  effort: ReasoningEffort | null;
  first: boolean;
  last: boolean;
  onEffort: (effort: ReasoningEffort | null) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  return (
    <MenuView
      actions={[
        ...(choices.length > 0
          ? [
              {
                id: 'thinking',
                title: 'Thinking',
                displayInline: true,
                subactions: choices.map((option) => ({
                  id: `effort:${option.value ?? 'auto'}`,
                  title: option.label,
                  state: (option.value === effort ? 'on' : 'off') as 'on' | 'off',
                })),
              },
            ]
          : []),
        ...(modes.length > 1
          ? [
              {
                id: 'route',
                title: 'Route Through',
                displayInline: true,
                subactions: modes.map((value) => ({
                  id: `route:${value}`,
                  title: ROUTE_LABELS[value],
                  state: (value === mode ? 'on' : 'off') as 'on' | 'off',
                })),
              },
            ]
          : []),
        {
          id: 'order',
          title: 'Order',
          displayInline: true,
          subactions: [
            { id: 'up', title: 'Move Up', image: 'arrow.up', attributes: { disabled: first } },
            { id: 'down', title: 'Move Down', image: 'arrow.down', attributes: { disabled: last } },
          ],
        },
        {
          id: 'remove',
          title: 'Remove from Chain',
          image: 'trash',
          attributes: { destructive: true },
        },
      ]}
      onPressAction={({ nativeEvent }) => {
        const event = nativeEvent.event;
        if (event === 'up') onMove(-1);
        else if (event === 'down') onMove(1);
        else if (event === 'remove') onRemove();
        else if (event.startsWith('route:')) onMode?.(event.slice('route:'.length) as RouteMode);
        else if (event.startsWith('effort:')) {
          const value = event.slice('effort:'.length);
          onEffort(value === 'auto' ? null : (value as ReasoningEffort));
        }
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Options for ${name}`}
        hitSlop={8}
        style={({ pressed }) => ({
          minWidth: 32,
          minHeight: 32,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.5 : 1,
        })}>
        <SymbolView name="ellipsis.circle" size={22} tintColor={colors.accent} />
      </Pressable>
    </MenuView>
  );
}
