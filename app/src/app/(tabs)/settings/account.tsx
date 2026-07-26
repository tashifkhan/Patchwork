import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, type TextInputProps } from 'react-native';

import { validateCalDavAccount } from '@/api/tasks';
import { SettingsScreen } from '@/components/settings/settings-list';
import { ServerTypeMenu } from '@/components/settings/server-type-menu';
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
import { Text, TextInput, View } from '@/tw';

export default function AccountEditor() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [serverType, setServerType] = useState<ServerType>('nextcloud');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [removeVisible, setRemoveVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'ok' | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(!!id);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getAccount(id)
      .then((account) => {
        if (!active || !account) return;
        setDisplayName(account.displayName);
        setUsername(account.username);
        setPassword(account.appPassword);
        setBaseUrl(account.baseUrl);
        setServerType(account.serverType);
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
      await validateCalDavAccount(candidate);
      await saveAccount({ ...candidate, id });
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

  return (
    <SettingsScreen>
      <Stack.Screen
        options={{
          title: isNew ? 'Add account' : displayName || 'Account',
          headerRight: () =>
            !isNew ? (
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
          showBar
        />
      ) : (
        <>
          {/* Intro — Paisa detail-header style */}
          <View
            className="flex-row items-start gap-3.5 rounded-3xl px-4 py-4"
            style={{
              backgroundColor: colors.bg2,
              borderCurve: 'continuous',
            }}>
            <View
              className="h-12 w-12 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: colors.primaryContainer,
                borderCurve: 'continuous',
              }}>
              <MaterialCommunityIcons
                name="cloud-sync-outline"
                size={26}
                color={colors.onPrimaryContainer}
              />
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-sf-text text-base font-bold">
                {isNew ? 'Connect CalDAV' : 'Account details'}
              </Text>
              <Text className="text-sf-text-2 text-sm" style={{ lineHeight: 20 }}>
                Works with Nextcloud, iCloud, Fastmail, and other CalDAV servers. Prefer an app
                password when available.
              </Text>
            </View>
          </View>

          {/* Profile */}
          <FormSection title="Profile">
            <FilledField
              label="Display name"
              icon="account-outline"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="My calendar"
              autoCapitalize="words"
              returnKeyType="next"
            />
          </FormSection>

          {/* Credentials */}
          <FormSection title="Credentials">
            <FilledField
              label="Username"
              icon="account-circle-outline"
              value={username}
              onChangeText={setUsername}
              placeholder="username or email"
              autoCapitalize="none"
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
            />
            <FilledField
              label="Password"
              icon="lock-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="App password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="next"
              trailing={
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  style={{
                    minWidth: 40,
                    minHeight: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <MaterialCommunityIcons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color={colors.text2}
                  />
                </Pressable>
              }
            />
          </FormSection>

          {/* Server */}
          <FormSection title="Server">
            <FilledField
              label="Server URL"
              icon="web"
              value={baseUrl}
              onChangeText={setBaseUrl}
              placeholder="https://cloud.example.com"
              keyboardType="url"
              autoCapitalize="none"
              autoComplete="off"
              textContentType="URL"
              returnKeyType="done"
            />
            <View className="gap-1.5">
              <Text
                className="px-1 text-xs font-semibold uppercase tracking-wide"
                style={{ color: colors.text2 }}>
                Server type
              </Text>
              <View
                className="flex-row items-center gap-3 rounded-2xl px-3.5"
                style={{
                  backgroundColor: colors.bg2,
                  minHeight: 56,
                  borderCurve: 'continuous',
                }}>
                <MaterialCommunityIcons name="server" size={22} color={colors.accent} />
                <View className="flex-1 py-1">
                  <ServerTypeMenu value={serverType} onChange={setServerType} />
                </View>
              </View>
            </View>
          </FormSection>

          {connectionStatus === 'ok' ? (
            <View
              className="flex-row items-center gap-2.5 rounded-2xl px-4 py-3.5"
              style={{
                backgroundColor: `${colors.green}18`,
                borderCurve: 'continuous',
              }}>
              <MaterialCommunityIcons name="check-circle" size={22} color={colors.green} />
              <Text className="text-sm font-medium" style={{ color: colors.green, flex: 1 }}>
                Connection successful — CalDAV is reachable.
              </Text>
            </View>
          ) : null}

          {/* Actions — full-width M3 buttons; loading uses Compose LoadingIndicator */}
          <View className="gap-3 pt-2">
            {testing || saving ? (
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
              disabled={saving || testing || !canSubmit}
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
                disabled={saving || testing}
                onPress={() => setRemoveVisible(true)}
                minHeight={52}
              />
            ) : null}
          </View>
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

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View className="gap-2.5">
      <Text
        className="px-1 text-xs font-semibold uppercase tracking-wide"
        style={{ color: colors.accent }}>
        {title}
      </Text>
      <View className="gap-3">{children}</View>
    </View>
  );
}

function FilledField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  textContentType,
  returnKeyType,
  trailing,
}: {
  label: string;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  trailing?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-1.5">
      <Text
        className="px-1 text-xs font-semibold uppercase tracking-wide"
        style={{ color: colors.text2 }}>
        {label}
      </Text>
      <View
        className="flex-row items-center gap-3 rounded-2xl px-3.5"
        style={{
          backgroundColor: colors.bg2,
          minHeight: 56,
          borderCurve: 'continuous',
        }}>
        <MaterialCommunityIcons name={icon} size={22} color={colors.accent} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.text3}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'none'}
          autoComplete={autoComplete}
          textContentType={textContentType}
          returnKeyType={returnKeyType}
          autoCorrect={false}
          underlineColorAndroid="transparent"
          accessibilityLabel={label}
          className="text-sf-text flex-1 py-3 text-base"
          style={{ minHeight: 48, color: colors.text }}
        />
        {trailing}
      </View>
    </View>
  );
}
