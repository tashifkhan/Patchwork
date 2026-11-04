import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Linking, Platform, Pressable } from 'react-native';

import {
  RowSeparator,
  SETTINGS_IOS,
  SettingsActionRow,
  SettingsDivider,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
  SettingsTextField,
  SettingsToggleRow,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { LoadingSpinner, LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import type { GitHubIssueScope } from '@/features/github/types';
import { useGitHubConnection } from '@/hooks/use-github-connection';
import { GITHUB_NEW_TOKEN_URL } from '@/lib/github-auth';
import { haptics } from '@/lib/haptics';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, TextInput, View } from '@/tw';

const SCOPES: {
  value: GitHubIssueScope;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  {
    value: 'assigned',
    title: 'Assigned to me',
    subtitle: 'Issues you are working on',
    icon: 'account-check-outline',
  },
  {
    value: 'created',
    title: 'Created by me',
    subtitle: 'Issues you opened',
    icon: 'pencil-outline',
  },
  {
    value: 'mentioned',
    title: 'Mentioning me',
    subtitle: 'Issues where you were @-mentioned',
    icon: 'at',
  },
  {
    value: 'all',
    title: 'All issues',
    subtitle: 'Everything in your repositories',
    icon: 'format-list-bulleted',
  },
];

/**
 * GitHub, connected with a personal access token only. Disconnected, the page
 * is a three-step setup; connected, it lists the repositories that show up as
 * lists in Tasks and the filter for which of their issues appear.
 */
export default function GitHubSettingsScreen() {
  const { colors } = useTheme();
  const connection = useGitHubConnection();
  const repositories = useSettingsStore((s) => s.githubRepositories);
  const setRepositories = useSettingsStore((s) => s.setGitHubRepositories);
  const scope = useSettingsStore((s) => s.githubIssueScope);
  const issueState = useSettingsStore((s) => s.githubIssueState);
  const setScope = useSettingsStore((s) => s.setGitHubIssueScope);
  const setIssueState = useSettingsStore((s) => s.setGitHubIssueState);
  const [token, setToken] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const state = connection.connection;
  const connected = state.status === 'connected';
  const account =
    state.status === 'connected' || state.status === 'refreshing'
      ? state.credentials.account
      : state.status === 'expired'
        ? state.account
        : undefined;

  async function connect() {
    try {
      await connection.connectPat(token);
      haptics.success();
      setToken('');
    } catch {
      haptics.error();
      // The hook keeps the message in `connectionError`, shown under the field.
    }
  }

  if (state.status === 'initializing') {
    return <LoadingState message="Checking GitHub…" fullScreen />;
  }

  return (
    <>
      <Stack.Screen options={{ title: 'GitHub', headerLargeTitle: false }} />
      <SettingsScreen>
        {/* Hero */}
        <View className="items-center gap-3" style={{ paddingTop: 8 }}>
          {account ? (
            <Image
              source={{ uri: account.avatarUrl }}
              style={{ width: 72, height: 72, borderRadius: 36 }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: SETTINGS_IOS ? 16 : 24,
                alignItems: 'center',
                justifyContent: 'center',
                borderCurve: 'continuous',
                backgroundColor: SETTINGS_IOS ? colors.accent : colors.primaryContainer,
              }}>
              <MaterialCommunityIcons
                name="github"
                size={40}
                color={SETTINGS_IOS ? colors.onAccent : colors.onPrimaryContainer}
              />
            </View>
          )}
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>
            {connected && account ? `@${account.login}` : 'Issues as to-dos'}
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 21,
              color: colors.text2,
              textAlign: 'center',
              maxWidth: 320,
            }}>
            {connected
              ? 'Each repository you add shows up as a list in Tasks. Ticking an issue closes it on GitHub.'
              : state.status === 'expired'
                ? state.message
                : 'Connect with a personal access token. It stays encrypted on this device.'}
          </Text>
        </View>

        {connected ? (
          <>
            <SettingsGroup
              title="Repositories"
              footer={
                repositories.length === 0
                  ? 'Add a repository to see its issues in Tasks.'
                  : undefined
              }>
              {repositories.map((repo) => (
                <SettingsRow
                  key={repo.fullName}
                  icon={repo.visibility === 'private' ? 'lock-outline' : 'source-repository'}
                  title={repo.fullName.split('/')[1] ?? repo.fullName}
                  subtitle={`${repo.fullName.split('/')[0]}${repo.canWriteIssues === false ? ' · read only' : ''}`}
                  trailing={
                    <Pressable
                      onPress={() => {
                        haptics.tap();
                        setRepositories(repositories.filter((r) => r.fullName !== repo.fullName));
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${repo.fullName}`}
                      hitSlop={8}
                      style={{
                        width: 40,
                        height: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {SETTINGS_IOS ? (
                        <SymbolView name="xmark.circle.fill" size={20} tintColor={colors.text3} />
                      ) : (
                        <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
                      )}
                    </Pressable>
                  }
                />
              ))}
              <SettingsRow
                icon="plus"
                title="Add repositories"
                onPress={() => router.push('/settings/github-repositories')}
                showChevron
              />
            </SettingsGroup>

            {/* One choice per row, like a radio list: no wrapping chips. */}
            <SettingsGroup title="Show issues">
              {SCOPES.map((option) => (
                <SettingsRow
                  key={option.value}
                  icon={option.icon}
                  title={option.title}
                  subtitle={option.subtitle}
                  selected={scope === option.value}
                  onPress={() => {
                    haptics.selection();
                    setScope(option.value);
                  }}
                  trailing={
                    scope === option.value ? (
                      <MaterialCommunityIcons name="check" size={22} color={colors.accent} />
                    ) : undefined
                  }
                />
              ))}
            </SettingsGroup>

            <SettingsGroup>
              <SettingsToggleRow
                icon="check-circle-outline"
                title="Show closed issues"
                subtitle="Listed under Closed in each repository"
                value={issueState !== 'open'}
                onValueChange={(on) => setIssueState(on ? 'all' : 'open')}
              />
            </SettingsGroup>

            <SettingsGroup>
              <SettingsRow
                icon="logout"
                title="Disconnect GitHub"
                danger
                onPress={() => setConfirmDisconnect(true)}
              />
            </SettingsGroup>
          </>
        ) : SETTINGS_IOS ? (
          <>
            <SettingsGroup title="Connect in three steps">
              <SettingsRow
                leading={<NumberTile n={1} />}
                title="Create a token on GitHub"
                subtitle="Opens github.com in Safari"
                onPress={() => Linking.openURL(GITHUB_NEW_TOKEN_URL)}
                trailing={
                  <SymbolView
                    name="arrow.up.right"
                    size={14}
                    weight="semibold"
                    tintColor={colors.text3}
                  />
                }
              />
              <RowSeparator />
              <SettingsRow
                leading={<NumberTile n={2} />}
                title="Give it access"
                subtitle="Pick the repositories you want, then set Issues to Read and write. Classic tokens with the repo scope work too."
              />
              <RowSeparator />
              <SettingsRow leading={<NumberTile n={3} />} title="Paste it below" />
            </SettingsGroup>

            <SettingsGroup
              title="Personal access token"
              footer={
                connection.connectionError ? (
                  <Text style={{ color: colors.danger }}>{connection.connectionError}</Text>
                ) : (
                  'Stored encrypted on this device.'
                )
              }>
              <SettingsTextField
                value={token}
                onChangeText={(value) => {
                  setToken(value);
                  if (connection.connectionError) connection.clearConnectionError();
                }}
                onSubmitEditing={connect}
                placeholder="github_pat_…"
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="go"
                accessibilityLabel="Personal access token"
                mono
              />
              <SettingsDivider />
              <SettingsActionRow
                title={connection.patPending ? 'Checking Token…' : 'Connect'}
                onPress={connect}
                disabled={!token.trim()}
                loading={connection.patPending}
              />
            </SettingsGroup>
          </>
        ) : (
          <SettingsGroup title="Connect in three steps">
            <View className="gap-5 px-4 py-4">
              <Step n={1} title="Create a token on GitHub">
                <Pressable
                  onPress={() => Linking.openURL(GITHUB_NEW_TOKEN_URL)}
                  accessibilityRole="link"
                  accessibilityLabel="Open GitHub to create a token"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    alignSelf: 'flex-start',
                    height: 36,
                    paddingHorizontal: 14,
                    borderRadius: pressed ? 10 : 18,
                    backgroundColor: colors.primaryContainer,
                  })}>
                  <MaterialCommunityIcons
                    name="open-in-new"
                    size={16}
                    color={colors.onPrimaryContainer}
                  />
                  <Text
                    style={{ fontSize: 14, fontWeight: '600', color: colors.onPrimaryContainer }}>
                    Open GitHub
                  </Text>
                </Pressable>
              </Step>
              <Step n={2} title="Give it access">
                <Text style={{ fontSize: 14, lineHeight: 20, color: colors.text2 }}>
                  Under Repository access pick the repos you want. Under Permissions set
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {' '}
                    Issues: Read and write
                  </Text>
                  . Metadata read is added for you. Classic tokens with the
                  <Text style={{ fontWeight: '700', color: colors.text }}> repo</Text> scope work
                  too.
                </Text>
              </Step>
              <Step n={3} title="Paste it here">
                <View
                  className="flex-row items-center"
                  style={{
                    height: 52,
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    gap: 10,
                    backgroundColor: colors.bg,
                    borderWidth: connection.connectionError ? 2 : 1,
                    borderColor: connection.connectionError ? colors.danger : colors.gray2,
                  }}>
                  <MaterialCommunityIcons name="key-variant" size={18} color={colors.text2} />
                  <TextInput
                    value={token}
                    onChangeText={(value) => {
                      setToken(value);
                      if (connection.connectionError) connection.clearConnectionError();
                    }}
                    onSubmitEditing={connect}
                    placeholder="github_pat_…"
                    placeholderTextColor={colors.text3}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    accessibilityLabel="Personal access token"
                    className="text-sf-text flex-1"
                    style={{
                      fontSize: 15,
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      paddingVertical: 0,
                    }}
                  />
                </View>
                {connection.connectionError ? (
                  <Text style={{ fontSize: 13, color: colors.danger, marginTop: 6 }}>
                    {connection.connectionError}
                  </Text>
                ) : null}
                <Pressable
                  onPress={connect}
                  disabled={!token.trim() || connection.patPending}
                  accessibilityRole="button"
                  accessibilityLabel="Connect GitHub"
                  android_ripple={{ color: colors.separator }}
                  style={({ pressed }) => ({
                    marginTop: 12,
                    height: 52,
                    borderRadius: pressed ? 14 : 26,
                    overflow: 'hidden',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    backgroundColor: colors.accent,
                    opacity: !token.trim() || connection.patPending ? 0.45 : 1,
                  })}>
                  {connection.patPending ? (
                    <LoadingSpinner size={22} />
                  ) : (
                    <MaterialCommunityIcons name="github" size={20} color={colors.onAccent} />
                  )}
                  <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>
                    {connection.patPending ? 'Checking token…' : 'Connect'}
                  </Text>
                </Pressable>
              </Step>
            </View>
          </SettingsGroup>
        )}
      </SettingsScreen>

      <NativeAlert
        visible={confirmDisconnect}
        title="Disconnect GitHub?"
        message="The token is removed from this device. Your repositories stay saved for when you reconnect."
        confirmLabel="Disconnect"
        dismissLabel="Cancel"
        onDismiss={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setConfirmDisconnect(false);
          void connection.disconnect();
        }}
      />
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row" style={{ gap: 14 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accent,
        }}>
        <Text style={{ color: colors.onAccent, fontSize: 14, fontWeight: '700' }}>{n}</Text>
      </View>
      <View className="flex-1 gap-2">
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, paddingTop: 3 }}>
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}

/** Step number on an accent tile, sized like the iOS settings icons. */
function NumberTile({ n }: { n: number }) {
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
