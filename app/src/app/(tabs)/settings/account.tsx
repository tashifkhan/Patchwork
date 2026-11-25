import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable } from 'react-native';

import { validateCalDavAccount } from '@/api/caldav/client';
import { CalDavServiceMenu, type CalDavService } from '@/components/settings/caldav-service-menu';
import {
  HeaderTextButton,
  SETTINGS_IOS,
  SettingsActionRow,
  SettingsDivider,
  SettingsGroup,
  SettingsScreen,
  SettingsTextField,
  SettingsValueRow,
  useSettingsColors,
} from '@/components/settings/settings-list';
import { PatchMascot } from '@/components/mascot/patch-mascot';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { LoadingBar, LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import {
  deleteAccount,
  getAccount,
  saveAccount,
  type ServerType,
} from '@/lib/credentials';
import { queryKeys } from '@/lib/query-client';
import { Text, View } from '@/tw';

export default function AccountEditor() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { cell } = useSettingsColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [caldavUrl, setCalDavUrl] = useState('');
  const [iCloudUrl, setICloudUrl] = useState(ICLOUD_CALDAV_URL);
  const [accountType, setAccountType] = useState<ServerType | 'icloud'>('nextcloud');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [removeVisible, setRemoveVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'ok' | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(!!id);
  const service = accountType === 'nextcloud' || accountType === 'owncloud' || accountType === 'icloud'
    ? accountType
    : 'other';
  const isICloud = service === 'icloud';
  const baseUrl = isICloud ? iCloudUrl : caldavUrl;
  const serverType = accountType === 'icloud' ? 'other' : accountType;

  useEffect(() => {
    if (!id) return;
    let active = true;
    getAccount(id)
      .then((account) => {
        if (!active || !account) return;
        setDisplayName(account.displayName);
        setUsername(account.username);
        setPassword(account.appPassword);
        const iCloud = isICloudUrl(account.baseUrl);
        setAccountType(iCloud ? 'icloud' : account.serverType);
        if (iCloud) setICloudUrl(account.baseUrl);
        else setCalDavUrl(account.baseUrl);
      })
      .finally(() => {
        if (active) setLoadingAccount(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const canSubmit =
    username.trim().length > 0 &&
    password.trim().length > 0 &&
    baseUrl.trim().length > 0 &&
    !saving;

  async function handleSave() {
    if (saving || !canSubmit) return;
    setSaving(true);
    setConnectionStatus(null);
    try {
      const candidate = {
        id: id ?? `validation-${Date.now()}`,
        displayName: displayName.trim() || username.trim(),
        baseUrl: baseUrl.trim(),
        username: username.trim(),
        appPassword: password,
        serverType,
      };
      const resolved = await validateCalDavAccount(candidate);
      await saveAccount({ ...resolved, id });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.taskLists }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deckBoards }),
      ]);
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    if (testing) return;
    setTesting(true);
    setConnectionStatus(null);
    try {
      await validateCalDavAccount({
        id: id ?? `validation-${Date.now()}`,
        displayName: displayName.trim() || username.trim(),
        baseUrl: baseUrl.trim(),
        username: username.trim(),
        appPassword: password,
        serverType,
      });
      setConnectionStatus('ok');
    } catch (error) {
      setConnectionStatus(null);
      setErrorMessage(error instanceof Error ? error.message : 'Connection failed.');
    } finally {
      setTesting(false);
    }
  }

  async function confirmRemove() {
    if (!id) return;
    setRemoveVisible(false);
    try {
      await deleteAccount(id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.taskLists }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
        queryClient.invalidateQueries({ queryKey: queryKeys.deckBoards }),
      ]);
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not remove the account.');
    }
  }

  const ios = SETTINGS_IOS;
  const busy = saving || testing;

  const eye = (
    <Pressable
      onPress={() => setShowPassword((v) => !v)}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
      style={{ minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' }}>
      {ios ? (
        <SymbolView
          name={showPassword ? 'eye.slash' : 'eye'}
          size={18}
          tintColor={colors.text2}
        />
      ) : (
        <MaterialCommunityIcons
          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
          size={22}
          color={colors.text2}
        />
      )}
    </Pressable>
  );

  const connectedNote =
    connectionStatus === 'ok' ? (
      <Text style={{ color: colors.green }}>Connection successful. CalDAV is reachable.</Text>
    ) : undefined;

  return (
    <SettingsScreen>
      <Stack.Screen
        options={{
          title: isNew ? 'Add Account' : displayName || 'Account',
          headerRight: () =>
            ios ? (
              // iOS: Save lives in the navigation bar (a Liquid Glass button).
              <HeaderTextButton
                label="Save"
                onPress={handleSave}
                disabled={!canSubmit || testing}
                loading={saving}
              />
            ) : !isNew ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove account"
                onPress={() => setRemoveVisible(true)}
                hitSlop={10}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.5 : 1,
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                })}>
                <MaterialCommunityIcons name="trash-can-outline" size={22} color={colors.danger} />
              </Pressable>
            ) : null,
        }}
      />

      {loadingAccount ? (
        <LoadingState
          fullScreen={false}
          message="Loading account…"
          subtitle="Fetching saved credentials"
        />
      ) : (
        <>
          {!ios ? (
            <View
              className="flex-row items-start gap-3.5 rounded-3xl px-4 py-4"
              style={{ backgroundColor: cell, borderCurve: 'continuous' }}>
              {isNew ? (
                <PatchMascot mood="connect" size={72} style={{ marginTop: -4 }} />
              ) : (
                <View
                  className="h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: colors.primaryContainer, borderCurve: 'continuous' }}>
                  <MaterialCommunityIcons
                    name="cloud-sync-outline"
                    size={26}
                    color={colors.onPrimaryContainer}
                  />
                </View>
              )}
              <View className="flex-1 gap-1">
                <Text className="text-sf-text text-base font-bold">
                  {isNew ? 'Connect CalDAV' : 'Account details'}
                </Text>
                <Text className="text-sf-text-2 text-sm" style={{ lineHeight: 20 }}>
                  {INTRO}
                </Text>
              </View>
            </View>
          ) : isNew ? (
            // iOS: Patch over the intro line, centred like a system setup page.
            <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
              <PatchMascot mood="connect" size={120} />
              <Text style={{ fontSize: 15, lineHeight: 20, color: colors.text2, textAlign: 'center' }}>{INTRO}</Text>
            </View>
          ) : null}

          <FormSection title="Server" footer={SERVICE_NOTE[service]}>
            <SettingsValueRow label="Service" icon="server">
              <CalDavServiceMenu
                value={service}
                onChange={(next) => {
                  if (next === service) return;
                  setAccountType(next);
                  setConnectionStatus(null);
                }}
              />
            </SettingsValueRow>
            <SettingsTextField
              label={ios ? 'URL' : 'Server URL'}
              icon="web"
              value={baseUrl}
              onChangeText={isICloud ? setICloudUrl : setCalDavUrl}
              placeholder={isICloud ? ICLOUD_CALDAV_URL : 'https://cloud.example.com'}
              keyboardType="url"
              autoCapitalize="none"
              autoComplete="off"
              textContentType="URL"
              returnKeyType="next"
            />
            {isICloud ? (
              <SettingsActionRow
                title="Create an app-specific password"
                onPress={() => void WebBrowser.openBrowserAsync('https://account.apple.com').catch(() => {})}
              />
            ) : null}
          </FormSection>

          <FormSection title={ios ? 'Account' : 'Profile'}>
            <SettingsTextField
              label={ios ? 'Name' : 'Display name'}
              icon="account-outline"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={ios ? 'Optional' : 'My calendar'}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </FormSection>

          <FormSection title="Credentials">
            <SettingsTextField
              label="Username"
              icon="account-circle-outline"
              value={username}
              onChangeText={setUsername}
              placeholder={ios ? 'Required' : 'username or email'}
              autoCapitalize="none"
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
            />
            <SettingsTextField
              label="Password"
              icon="lock-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="App password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              trailing={eye}
            />
          </FormSection>

          {ios ? (
            <>
              <SettingsGroup footer={connectedNote}>
                <SettingsActionRow
                  title="Test Connection"
                  onPress={testConnection}
                  loading={testing}
                  disabled={saving || !canSubmit}
                />
              </SettingsGroup>
              {!isNew ? (
                <SettingsGroup>
                  <SettingsActionRow
                    title="Delete Account"
                    destructive
                    disabled={busy}
                    onPress={() => setRemoveVisible(true)}
                  />
                </SettingsGroup>
              ) : null}
            </>
          ) : (
            <>
              {connectionStatus === 'ok' ? (
                <View
                  className="flex-row items-center gap-2.5 rounded-2xl px-4 py-3.5"
                  style={{ backgroundColor: `${colors.green}18`, borderCurve: 'continuous' }}>
                  <MaterialCommunityIcons name="check-circle" size={22} color={colors.green} />
                  <Text className="text-sm font-medium" style={{ color: colors.green, flex: 1 }}>
                    Connection successful. CalDAV is reachable.
                  </Text>
                </View>
              ) : null}

              <View className="gap-3 pt-2">
                {busy ? (
                  <View className="gap-2 px-0.5 pb-1">
                    <Text className="text-sf-text-2 text-center text-sm font-medium">
                      {testing ? 'Testing CalDAV connection…' : 'Saving account…'}
                    </Text>
                    <LoadingBar />
                  </View>
                ) : null}
                <Button
                  variant="tonal"
                  label="Test connection"
                  icon="lan-connect"
                  loading={testing}
                  disabled={busy || !canSubmit}
                  onPress={testConnection}
                  minHeight={52}
                />
                <Button
                  label={isNew ? 'Save account' : 'Save changes'}
                  icon="content-save-outline"
                  loading={saving}
                  disabled={!canSubmit || testing}
                  onPress={handleSave}
                  minHeight={52}
                />
                {!isNew ? (
                  <Button
                    variant="danger"
                    label="Remove account"
                    icon="trash-can-outline"
                    disabled={busy}
                    onPress={() => setRemoveVisible(true)}
                    minHeight={52}
                  />
                ) : null}
              </View>
            </>
          )}
        </>
      )}

      <NativeAlert
        visible={removeVisible}
        title="Remove account"
        message="Remove this account and its sync from this device?"
        confirmLabel="Remove"
        dismissLabel="Cancel"
        onDismiss={() => setRemoveVisible(false)}
        onConfirm={confirmRemove}
      />
      <NativeAlert
        visible={errorMessage != null}
        title="Could not save account"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </SettingsScreen>
  );
}

const INTRO = 'Connect a CalDAV account to sync your to-dos.';
const ICLOUD_CALDAV_URL = 'https://caldav.icloud.com';

const SERVICE_NOTE: Record<CalDavService, string> = {
  nextcloud: 'Create an app password in your Nextcloud security settings.',
  owncloud: 'Use an app password if your ownCloud server offers one.',
  icloud:
    Platform.OS === 'ios'
      ? 'Use your Apple Account email and an app-specific password. For upgraded lists, turn on Apple Reminders in Settings, Calendars and reminders.'
      : 'Use your Apple Account email and an app-specific password. iCloud only shares older reminder lists over CalDAV.',
  other: 'Enter your provider’s CalDAV address. Use an app password if available.',
};

function isICloudUrl(value: string) {
  try {
    const { hostname } = new URL(value);
    return hostname === 'icloud.com' || hostname.endsWith('.icloud.com');
  } catch {
    return false;
  }
}

/** A grouped card of form fields, divided like any settings group. */
function FormSection({
  title,
  footer,
  children,
}: {
  title: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const fields = Children.toArray(children).filter(isValidElement);
  return (
    <SettingsGroup title={title} footer={footer}>
      {fields.map((field, index) => (
        <Fragment key={field.key ?? index}>
          {index > 0 ? <SettingsDivider /> : null}
          {field}
        </Fragment>
      ))}
    </SettingsGroup>
  );
}
