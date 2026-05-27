import {
  BottomSheet,
  Button as UIButton,
  Column as UIColumn,
  Host,
  Slider,
  Text as UIText,
} from '@expo/ui';
import SegmentedControl from '@expo/ui/community/segmented-control';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { getApiBaseUrl } from '@/api/client';
import { useTheme } from '@/components/theme/context';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useHealth } from '@/hooks/use-health';
import { useTaskLists } from '@/hooks/use-tasks';
import { ensureNotificationPermissions } from '@/lib/notifications';
import { useSettingsStore, type ThemeMode } from '@/stores/settings-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

const THEME_OPTIONS: ThemeMode[] = ['system', 'light', 'dark'];
const THEME_LABELS = ['System', 'Light', 'Dark'];

const ACCENT_PRESETS = ['#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#FF9F0A', '#30D158'];

export default function SettingsScreen() {
  const { colors, scheme } = useTheme();
  const queryClient = useQueryClient();

  const proxyUrl = useSettingsStore((s) => s.proxyUrl);
  const setProxyUrl = useSettingsStore((s) => s.setProxyUrl);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const dynamicColor = useSettingsStore((s) => s.dynamicColor);
  const setDynamicColor = useSettingsStore((s) => s.setDynamicColor);
  const pureBlack = useSettingsStore((s) => s.pureBlack);
  const setPureBlack = useSettingsStore((s) => s.setPureBlack);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const defaultReminderMinutes = useSettingsStore((s) => s.defaultReminderMinutes);
  const setDefaultReminderMinutes = useSettingsStore((s) => s.setDefaultReminderMinutes);
  const aiDefaultListId = useSettingsStore((s) => s.aiDefaultListId);
  const setAiDefaultListId = useSettingsStore((s) => s.setAiDefaultListId);

  const healthQuery = useHealth();
  const listsQuery = useTaskLists();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);

  const [urlDraft, setUrlDraft] = useState(proxyUrl);
  const [aboutOpen, setAboutOpen] = useState(false);

  const isAndroid = Platform.OS === 'android';
  const accentDisabled = isAndroid && dynamicColor;
  const backendOk = !healthQuery.isError && !!healthQuery.data;
  const reminderLabel =
    defaultReminderMinutes <= 0 ? 'At due time' : `${defaultReminderMinutes} min before`;

  function saveProxyUrl() {
    setProxyUrl(urlDraft.trim());
    queryClient.invalidateQueries();
    Alert.alert('Saved', 'Proxy URL updated.');
  }

  async function toggleNotifications(value: boolean) {
    if (value) {
      const granted = await ensureNotificationPermissions();
      if (!granted) {
        Alert.alert('Permission needed', 'Enable notifications in system settings to get reminders.');
        return;
      }
    }
    setNotificationsEnabled(value);
  }

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      <Section title="Connection" icon="link" delay={0}>
        <View className="gap-2 px-4 pb-3 pt-3.5">
          <Text className="text-sf-text-2 text-xs font-semibold uppercase tracking-wide">Proxy URL</Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              value={urlDraft}
              onChangeText={setUrlDraft}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://localhost:8000"
              placeholderTextColor={colors.text3}
              className="text-sf-text bg-sf-bg flex-1 rounded-xl px-3.5 py-2.5 text-base"
              style={{ borderCurve: 'continuous' }}
            />
            <Pressable
              onPress={saveProxyUrl}
              disabled={urlDraft.trim() === proxyUrl}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : urlDraft.trim() === proxyUrl ? 0.35 : 1 })}>
              <View className="bg-sf-blue rounded-xl px-4 py-2.5" style={{ borderCurve: 'continuous' }}>
                <Text className="text-sf-on-accent text-base font-semibold">Save</Text>
              </View>
            </Pressable>
          </View>
        </View>
        <Divider />
        <StatusRow
          label="Backend reachable"
          ok={backendOk}
          color={backendOk ? colors.green : colors.red}
        />
        <Divider />
        <StatusRow
          label="Nextcloud configured"
          ok={!!healthQuery.data?.nextcloud_configured}
          color={healthQuery.data?.nextcloud_configured ? colors.green : colors.red}
        />
        <Divider />
        <StatusRow
          label="Gemini configured"
          ok={!!healthQuery.data?.gemini_configured}
          color={healthQuery.data?.gemini_configured ? colors.green : colors.red}
        />
        <Divider />
        <Pressable
          onPress={() => queryClient.invalidateQueries()}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <View className="flex-row items-center gap-2.5 px-4 py-3.5">
            <Icon name="arrow.clockwise" size={18} color={colors.accent} />
            <Text className="text-sf-blue text-base font-medium">Refresh all data</Text>
          </View>
        </Pressable>
      </Section>

      <Section title="Appearance" icon="paintbrush.fill" delay={60}>
        <View className="gap-2.5 px-4 pb-3.5 pt-3.5">
          <Text className="text-sf-text-2 text-xs font-semibold uppercase tracking-wide">Theme</Text>
          <SegmentedControl
            appearance={scheme}
            values={THEME_LABELS}
            selectedIndex={Math.max(0, THEME_OPTIONS.indexOf(themeMode))}
            tintColor={colors.accent}
            onChange={(event) =>
              setThemeMode(THEME_OPTIONS[event.nativeEvent.selectedSegmentIndex] ?? 'system')
            }
          />
        </View>

        {isAndroid ? (
          <>
            <Divider />
            <ToggleRow
              label="Wallpaper colors"
              subtitle="Material You palette from your wallpaper"
              value={dynamicColor}
              onValueChange={setDynamicColor}
            />
            <Divider />
            <ToggleRow
              label="Pure black"
              subtitle="True-black AMOLED surfaces in dark mode"
              value={pureBlack}
              onValueChange={setPureBlack}
            />
          </>
        ) : null}

        <Divider />
        <View className="gap-3 px-4 pb-4 pt-3.5">
          <Text className="text-sf-text-2 text-xs font-semibold uppercase tracking-wide">Accent</Text>
          <View
            className="flex-row flex-wrap items-center gap-3.5"
            style={{ opacity: accentDisabled ? 0.4 : 1 }}>
            <Swatch
              selected={!accentColor}
              ringColor={colors.accent}
              onPress={() => setAccentColor(null)}
              isDefault
              checkColor={colors.text2}
              borderColor={colors.separator}
            />
            {ACCENT_PRESETS.map((color) => (
              <Swatch
                key={color}
                color={color}
                selected={accentColor === color}
                ringColor={colors.text}
                checkColor="#FFFFFF"
                onPress={() => !accentDisabled && setAccentColor(color)}
              />
            ))}
          </View>
          {accentDisabled ? (
            <Text className="text-sf-text-3 text-xs">
              Turn off wallpaper colors to choose an accent.
            </Text>
          ) : null}
        </View>
      </Section>

      <Section title="Notifications" icon="bell.fill" delay={120}>
        <ToggleRow
          label="Task reminders"
          subtitle="Get notified before tasks are due"
          value={notificationsEnabled}
          onValueChange={toggleNotifications}
        />
        {notificationsEnabled ? (
          <>
            <Divider />
            <View className="gap-1.5 px-4 pb-4 pt-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-sf-text text-base">Default lead time</Text>
                <Text
                  className="text-sf-text-2 text-base font-medium"
                  style={{ fontVariant: ['tabular-nums'] }}>
                  {reminderLabel}
                </Text>
              </View>
              <Host style={{ height: 36 }}>
                <Slider
                  value={defaultReminderMinutes}
                  min={0}
                  max={60}
                  step={5}
                  onValueChange={(v) => setDefaultReminderMinutes(Math.round(v))}
                />
              </Host>
            </View>
          </>
        ) : null}
      </Section>

      {lists.length > 0 ? (
        <Section title="AI Import" icon="sparkles" delay={180}>
          <View className="gap-3 px-4 pb-4 pt-3.5">
            <Text className="text-sf-text-2 text-xs font-semibold uppercase tracking-wide">
              Default list
            </Text>
            <View className="flex-row flex-wrap items-center gap-2">
              {lists.map((list) => (
                <ToggleChip
                  key={list.id}
                  label={list.name}
                  selected={list.id === aiDefaultListId}
                  onPress={() =>
                    setAiDefaultListId(list.id === aiDefaultListId ? null : list.id)
                  }
                />
              ))}
            </View>
          </View>
        </Section>
      ) : null}

      <Pressable
        onPress={() => setAboutOpen(true)}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
        className="items-center gap-1 pt-2">
        <Text className="text-sf-text-3 text-xs font-medium uppercase tracking-wide">
          About & diagnostics
        </Text>
        <Text className="text-sf-text-3 text-xs" style={{ fontVariant: ['tabular-nums'] }}>
          v{Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </Pressable>

      <Host style={styles.sheetHost}>
        <BottomSheet isPresented={aboutOpen} onDismiss={() => setAboutOpen(false)}>
          <UIColumn spacing={14} style={{ padding: 24 }}>
            <UIText textStyle={{ fontSize: 22, fontWeight: '700', color: colors.text }}>
              {Constants.expoConfig?.name ?? 'CalDAV Todo'}
            </UIText>
            <UIText textStyle={{ fontSize: 15, color: colors.text2 }}>
              {`Version ${Constants.expoConfig?.version ?? '1.0.0'}`}
            </UIText>
            <UIText textStyle={{ fontSize: 13, color: colors.text3 }}>{getApiBaseUrl()}</UIText>
            <UIButton
              variant="filled"
              label="Refresh all data"
              onPress={() => {
                queryClient.invalidateQueries();
                setAboutOpen(false);
              }}
            />
            <UIButton variant="text" label="Close" onPress={() => setAboutOpen(false)} />
          </UIColumn>
        </BottomSheet>
      </Host>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: 26,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
  },
  // The sheet is a modal overlay; keep its host out of the scroll layout flow.
  sheetHost: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
});

function Swatch({
  color,
  selected,
  ringColor,
  borderColor,
  checkColor,
  isDefault,
  onPress,
}: {
  color?: string;
  selected: boolean;
  ringColor: string;
  borderColor?: string;
  checkColor: string;
  isDefault?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: color ?? 'transparent',
          borderWidth: selected ? 2.5 : isDefault ? 1 : 0,
          borderColor: selected ? ringColor : (borderColor ?? 'transparent'),
          boxShadow: color ? `0 1px 4px ${color}55` : undefined,
        }}>
        {isDefault && !selected ? (
          <Icon name="slash.circle" size={18} color={checkColor} />
        ) : null}
        {selected ? <Icon name="checkmark" size={16} color={checkColor} weight="bold" /> : null}
      </View>
    </Pressable>
  );
}

function Section({
  title,
  icon,
  delay,
  children,
}: {
  title: string;
  icon: Parameters<typeof Icon>[0]['name'];
  delay: number;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(18)} style={{ gap: 8 }}>
      <View className="flex-row items-center gap-1.5 px-4">
        <Icon name={icon} size={12} color={colors.text2} />
        <Text className="text-sf-text-2 text-xs font-semibold uppercase tracking-wide">{title}</Text>
      </View>
      <View
        className="bg-sf-bg-2 overflow-hidden rounded-2xl"
        style={{ borderCurve: 'continuous', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {children}
      </View>
    </Animated.View>
  );
}

function Divider() {
  return <View className="bg-sf-separator ml-4 h-px" />;
}

function ToggleRow({
  label,
  subtitle,
  value,
  onValueChange,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 py-3">
      <View className="flex-1">
        <Text className="text-sf-text text-base">{label}</Text>
        {subtitle ? <Text className="text-sf-text-2 mt-0.5 text-xs">{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function StatusRow({ label, ok, color }: { label: string; ok: boolean; color: string }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3.5">
      <Text className="text-sf-text text-base">{label}</Text>
      <Icon name={ok ? 'checkmark.circle.fill' : 'xmark.circle.fill'} size={20} color={color} />
    </View>
  );
}
