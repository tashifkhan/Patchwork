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
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { getApiBaseUrl } from '@/api/client';
import { ConnectionHelp } from '@/components/settings/connection-help';
import { useTheme } from '@/components/theme/context';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { ToggleChip } from '@/components/ui/toggle-chip';
import { useHealth } from '@/hooks/use-health';
import { useTaskLists } from '@/hooks/use-tasks';
import {
  clearGeminiApiKey,
  clearNextcloudCredentials,
  getCredentials,
  saveGeminiApiKey,
  saveNextcloudCredentials,
} from '@/lib/credentials';
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
  const [nextcloudUrlDraft, setNextcloudUrlDraft] = useState('');
  const [nextcloudUsernameDraft, setNextcloudUsernameDraft] = useState('');
  const [nextcloudPasswordDraft, setNextcloudPasswordDraft] = useState('');
  const [geminiKeyDraft, setGeminiKeyDraft] = useState('');
  const [hasNextcloudCredentials, setHasNextcloudCredentials] = useState(false);
  const [hasGeminiApiKey, setHasGeminiApiKey] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  const isAndroid = Platform.OS === 'android';
  const isWeb = Platform.OS === 'web';
  const accentDisabled = isAndroid && dynamicColor;
  const backendOk = !healthQuery.isError && !!healthQuery.data;
  const reminderLabel =
    defaultReminderMinutes <= 0 ? 'At due time' : `${defaultReminderMinutes} min before`;

  useEffect(() => {
    if (isWeb) return;
    let cancelled = false;
    getCredentials().then((credentials) => {
      if (cancelled) return;
      setHasNextcloudCredentials(!!credentials.nextcloud);
      setHasGeminiApiKey(!!credentials.geminiApiKey);
      setNextcloudUrlDraft(credentials.nextcloud?.baseUrl ?? '');
      setNextcloudUsernameDraft(credentials.nextcloud?.username ?? '');
      setNextcloudPasswordDraft(credentials.nextcloud ? '••••••••' : '');
      setGeminiKeyDraft(credentials.geminiApiKey ? '••••••••' : '');
    });
    return () => {
      cancelled = true;
    };
  }, [isWeb]);

  function saveProxyUrl() {
    setProxyUrl(urlDraft.trim());
    queryClient.invalidateQueries();
    Alert.alert('Saved', 'Proxy URL updated.');
  }

  async function saveNativeCredentials() {
    try {
      const existing = await getCredentials();
      await saveNextcloudCredentials({
        baseUrl: nextcloudUrlDraft,
        username: nextcloudUsernameDraft,
        appPassword:
          nextcloudPasswordDraft === '••••••••'
            ? existing.nextcloud?.appPassword ?? ''
            : nextcloudPasswordDraft,
      });
      setHasNextcloudCredentials(true);
      setNextcloudPasswordDraft('••••••••');
      queryClient.invalidateQueries();
      Alert.alert('Saved', 'Nextcloud credentials saved on this device.');
    } catch (error) {
      Alert.alert('Could not save credentials', error instanceof Error ? error.message : 'Try again.');
    }
  }

  async function removeNativeCredentials() {
    await clearNextcloudCredentials();
    setHasNextcloudCredentials(false);
    setNextcloudUrlDraft('');
    setNextcloudUsernameDraft('');
    setNextcloudPasswordDraft('');
    queryClient.invalidateQueries();
  }

  async function saveNativeGeminiKey() {
    try {
      const existing = await getCredentials();
      await saveGeminiApiKey(geminiKeyDraft === '••••••••' ? existing.geminiApiKey ?? '' : geminiKeyDraft);
      setHasGeminiApiKey(true);
      setGeminiKeyDraft('••••••••');
      queryClient.invalidateQueries();
      Alert.alert('Saved', 'Gemini API key saved on this device.');
    } catch (error) {
      Alert.alert('Could not save API key', error instanceof Error ? error.message : 'Try again.');
    }
  }

  async function removeNativeGeminiKey() {
    await clearGeminiApiKey();
    setHasGeminiApiKey(false);
    setGeminiKeyDraft('');
    queryClient.invalidateQueries();
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
      <Section title="Connection" icon="link" delay={0} accessory={<ConnectionHelp />}>
        {isWeb ? (
          <>
            <View className="gap-3 px-4 pb-4 pt-3.5">
              <SubHeader
                label="Proxy"
                status={backendOk ? 'ok' : 'off'}
                statusLabel={backendOk ? 'Reachable' : 'Offline'}
              />
              <FieldGroup>
                <CredentialRow
                  label="Proxy URL"
                  value={urlDraft}
                  onChangeText={setUrlDraft}
                  placeholder="https://your-proxy.example.com"
                  keyboardType="url"
                />
              </FieldGroup>
              <PrimaryButton
                label="Save Proxy URL"
                disabled={urlDraft.trim() === proxyUrl}
                onPress={saveProxyUrl}
              />
            </View>
            <Divider />
            <StatusRow
              label="Nextcloud configured on proxy"
              ok={!!healthQuery.data?.nextcloud_configured}
            />
            <Divider />
            <StatusRow
              label="Gemini configured on proxy"
              ok={!!healthQuery.data?.gemini_configured}
            />
          </>
        ) : (
          <>
            <View className="gap-3 px-4 pb-4 pt-3.5">
              <SubHeader
                label="Nextcloud"
                status={hasNextcloudCredentials ? 'ok' : 'off'}
                statusLabel={hasNextcloudCredentials ? 'Saved' : 'Not set'}
              />
              <FieldGroup>
                <CredentialRow
                  label="Server"
                  value={nextcloudUrlDraft}
                  onChangeText={setNextcloudUrlDraft}
                  placeholder="https://cloud.example.com"
                  keyboardType="url"
                />
                <RowDivider />
                <CredentialRow
                  label="Username"
                  value={nextcloudUsernameDraft}
                  onChangeText={setNextcloudUsernameDraft}
                  placeholder="Username"
                />
                <RowDivider />
                <CredentialRow
                  label="Password"
                  value={nextcloudPasswordDraft}
                  onChangeText={setNextcloudPasswordDraft}
                  placeholder="App password"
                  secureTextEntry
                />
              </FieldGroup>
              <PrimaryButton label="Save Nextcloud" onPress={saveNativeCredentials} />
              {hasNextcloudCredentials ? (
                <RemoveButton label="Remove Nextcloud account" onPress={removeNativeCredentials} />
              ) : null}
            </View>
            <Divider />
            <View className="gap-3 px-4 pb-4 pt-3.5">
              <SubHeader
                label="Gemini BYOK"
                status={hasGeminiApiKey ? 'ok' : 'off'}
                statusLabel={hasGeminiApiKey ? 'Saved' : 'Optional'}
              />
              <FieldGroup>
                <CredentialRow
                  label="API Key"
                  value={geminiKeyDraft}
                  onChangeText={setGeminiKeyDraft}
                  placeholder="Gemini API key"
                  secureTextEntry
                />
              </FieldGroup>
              <PrimaryButton label="Save Gemini key" onPress={saveNativeGeminiKey} />
              {hasGeminiApiKey ? (
                <RemoveButton label="Remove Gemini API key" onPress={removeNativeGeminiKey} />
              ) : null}
            </View>
          </>
        )}
        <Divider />
        <Pressable
          onPress={() => {
            queryClient.invalidateQueries();
            Alert.alert('Refreshed', 'All data cache has been invalidated.');
          }}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <View className="flex-row items-center gap-2.5 px-4 py-3.5">
            <Text className="text-sf-blue text-lg" style={{ marginTop: -2 }}>
              {'↻'}
            </Text>
            <Text className="text-sf-blue text-base font-semibold">Refresh all data</Text>
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
            <UIText textStyle={{ fontSize: 13, color: colors.text3 }}>
              {isWeb ? getApiBaseUrl() : 'Native direct CalDAV + BYOK Gemini'}
            </UIText>
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
  accessory,
  children,
}: {
  title: string;
  icon: Parameters<typeof Icon>[0]['name'];
  delay: number;
  accessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(18)} style={{ gap: 8 }}>
      <View className="min-h-6 flex-row items-center justify-between px-4">
        <View className="flex-row items-center gap-1.5">
          <Icon name={icon} size={12} color={colors.text2} />
          <Text className="text-sf-text-2 text-xs font-semibold uppercase tracking-wide">
            {title}
          </Text>
        </View>
        {accessory}
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

function CredentialRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'url';
  secureTextEntry?: boolean;
}) {
  const { colors } = useTheme();
  const [isSecure, setIsSecure] = useState(secureTextEntry);

  return (
    <View className="min-h-[52px] flex-row items-center bg-sf-bg-3 px-4">
      <Text className="text-sf-text-2 w-[88px] text-sm font-medium" numberOfLines={1}>
        {label}
      </Text>
      <View className="flex-1 flex-row items-center gap-2">
        <TextInput
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={keyboardType}
          secureTextEntry={isSecure}
          placeholder={placeholder}
          placeholderTextColor={colors.text3}
          className="text-sf-text flex-1 py-3 text-base"
          style={{ includeFontPadding: false }}
        />
        {secureTextEntry ? (
          <Pressable
            onPress={() => setIsSecure(!isSecure)}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <Text className="text-sf-blue text-sm font-medium">{isSecure ? 'Show' : 'Hide'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Rounded, hairline-bordered container that groups credential rows like an inset list. */
function FieldGroup({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      className="bg-sf-bg-3 overflow-hidden rounded-xl"
      style={{ borderCurve: 'continuous', borderWidth: 1, borderColor: colors.separator }}>
      {children}
    </View>
  );
}

/** Inset divider between rows inside a FieldGroup. */
function RowDivider() {
  return <View className="bg-sf-separator ml-4 h-px" />;
}

/** Full-width filled action button with a soft accent lift. */
function PrimaryButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : pressed ? 0.9 : 1,
        transform: [{ scale: pressed && !disabled ? 0.985 : 1 }],
      })}>
      <View
        className={`items-center rounded-xl py-3 ${disabled ? 'bg-sf-gray-3' : 'bg-sf-blue'}`}
        style={{
          borderCurve: 'continuous',
          boxShadow: disabled ? undefined : `0 3px 10px ${colors.accent}40`,
        }}>
        <Text
          className={`text-base font-semibold ${disabled ? 'text-sf-text-3' : 'text-sf-on-accent'}`}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Ghost destructive action. */
function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <View className="items-center py-1">
        <Text className="text-sf-red text-sm font-semibold">{label}</Text>
      </View>
    </Pressable>
  );
}

/** Subsection header: a label with a small cross-platform status chip on the right. */
function SubHeader({
  label,
  status,
  statusLabel,
}: {
  label: string;
  status: 'ok' | 'off';
  statusLabel: string;
}) {
  const { colors } = useTheme();
  
  let badgeBg = 'rgba(142, 142, 147, 0.12)';
  let badgeText = colors.gray;
  let dotColor = colors.gray;

  if (status === 'ok') {
    badgeBg = 'rgba(48, 209, 89, 0.12)';
    badgeText = colors.green;
    dotColor = colors.green;
  } else if (statusLabel === 'Optional') {
    badgeBg = 'rgba(10, 132, 255, 0.12)'; // Soft blue for optional
    badgeText = colors.accent;
    dotColor = colors.accent;
  }

  return (
    <View className="flex-row items-center justify-between mb-1">
      <Text className="text-sf-text-2 text-xs font-semibold uppercase tracking-wide">{label}</Text>
      <View
        className="flex-row items-center gap-1.5 rounded-full px-2.5 py-0.5"
        style={{ backgroundColor: badgeBg, borderCurve: 'continuous' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor }} />
        <Text className="text-xs font-semibold" style={{ color: badgeText }}>
          {statusLabel}
        </Text>
      </View>
    </View>
  );
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

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 py-3.5">
      <Text className="text-sf-text flex-1 text-base">{label}</Text>
      <View className="flex-row items-center gap-1.5">
        <View
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ok ? colors.green : colors.gray }}
        />
        <Text className="text-sf-text-2 text-sm font-medium">{ok ? 'Yes' : 'No'}</Text>
      </View>
    </View>
  );
}
