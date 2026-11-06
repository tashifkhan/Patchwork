import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Fragment, useState } from 'react';
import { Linking, Platform, Pressable } from 'react-native';

import {
  RowSeparator,
  SETTINGS_IOS,
  SettingsActionRow,
  SettingsDivider,
  SettingsGroup,
  SettingsLinkRow,
  SettingsRow,
  SettingsScreen,
  SettingsTextField,
  SettingsToggleRow,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { LoadingSpinner, LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import type { GitHubAccount, GitHubIssueScope } from '@/features/github/types';
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
 * GitHub, connected with personal access tokens only. Disconnected, the page
 * is a three-step setup; connected, it lists the accounts (add as many as you
 * like), the repositories that show up as lists in Tasks, and the filter for
 * which of their issues appear.
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
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<GitHubAccount | 'all' | null>(null);

  const state = connection.connection;
  const connected = state.status === 'connected';
  const accounts = state.status === 'connected' || state.status === 'refreshing' ? state.accounts : [];
  const expired = 'expired' in state ? state.expired : [];
  const allAccounts = [
    ...accounts.map((entry) => ({ account: entry.account, message: undefined as string | undefined })),
    ...expired,
  ];
  const multiple = allAccounts.length > 1;
  const account = multiple
    ? undefined
    : state.status === 'connected' || state.status === 'refreshing'
      ? state.credentials.account
      : state.status === 'expired'
        ? state.account
        : undefined;
  const loginById = new Map(accounts.map((entry) => [entry.account.id, entry.account.login]));

  async function connect() {
    try {
      await connection.connectPat(token);
      haptics.success();
      setToken('');
      setAdding(false);
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
                backgroundColor: SETTINGS_IOS ? '#24292F' : colors.primaryContainer,
              }}>
              <MaterialCommunityIcons
                name="github"
                size={40}
                color={SETTINGS_IOS ? '#FFFFFF' : colors.onPrimaryContainer}
              />
            </View>
          )}
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>
            {connected && account
              ? `@${account.login}`
              : connected && multiple
                ? `${allAccounts.length} GitHub accounts`
                : 'Issues as to-dos'}
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
              title="Accounts"
              footer={
                connection.connectionError && adding ? (
                  <Text style={{ color: colors.danger }}>{connection.connectionError}</Text>
                ) : expired.length > 0 ? (
                  'Paste a new token for an account that stopped working, or remove it.'
                ) : adding ? (
                  'A token for an account you already have replaces its old one.'
                ) : (
                  'Add another account to bring in its repositories too.'
                )
              }>
              {allAccounts.map((entry, index) => (
                <Fragment key={`${entry.account.id}:${entry.account.login}`}>
                  {index > 0 ? <RowSeparator /> : null}
                  <SettingsRow
                    leading={
                      <Image
                        source={{ uri: entry.account.avatarUrl }}
                        style={{
                          width: SETTINGS_IOS ? 30 : 40,
                          height: SETTINGS_IOS ? 30 : 40,
                          borderRadius: SETTINGS_IOS ? 15 : 20,
                        }}
                        accessibilityIgnoresInvertColors
                      />
                    }
                    title={`@${entry.account.login}`}
                    subtitle={entry.message ? 'Needs a new token' : undefined}
                    danger={!!entry.message}
                    onPress={entry.message ? () => setAdding(true) : undefined}
                    trailing={
                      <Pressable
                        onPress={() => {
                          haptics.tap();
                          setRemoving(entry.account);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove @${entry.account.login}`}
                        hitSlop={8}
                        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                        {SETTINGS_IOS ? (
                          <SymbolView name="xmark.circle.fill" size={20} tintColor={colors.text3} />
                        ) : (
                          <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
                        )}
                      </Pressable>
                    }
                  />
                </Fragment>
              ))}
              <RowSeparator />
              {adding ? (
                <>
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
                    autoFocus
                    mono
                  />
                  <SettingsDivider />
                  <SettingsActionRow
                    title={connection.patPending ? 'Checking Token…' : 'Add Account'}
                    onPress={connect}
                    disabled={!token.trim()}
                    loading={connection.patPending}
                  />
                  <SettingsDivider />
                  <SettingsRow
                    icon="open-in-new"
                    title="Create a token on GitHub"
                    onPress={() => Linking.openURL(GITHUB_NEW_TOKEN_URL)}
                  />
                  <SettingsDivider />
                  <SettingsActionRow
                    title="Cancel"
                    onPress={() => {
                      setAdding(false);
                      setToken('');
                      connection.clearConnectionError();
                    }}
                  />
                </>
              ) : (
                <SettingsRow
                  icon="plus"
                  title="Add account"
                  onPress={() => {
                    haptics.tap();
                    setAdding(true);
                  }}
                />
              )}
            </SettingsGroup>

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
                  subtitle={[
                    repo.fullName.split('/')[0],
                    multiple && repo.accountId != null && loginById.get(repo.accountId)
                      ? `via @${loginById.get(repo.accountId)}`
                      : null,
                    repo.canWriteIssues === false ? 'read only' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
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
                title={multiple ? 'Disconnect all' : 'Disconnect GitHub'}
                danger
                onPress={() => setRemoving('all')}
              />
            </SettingsGroup>
          </>
        ) : SETTINGS_IOS ? (
          <>
            {/* iOS form pattern: the confirm action lives in the navigation bar. */}
            <Stack.Toolbar placement="right">
              <Stack.Toolbar.Button
                variant="done"
                disabled={!token.trim() || connection.patPending}
                accessibilityLabel="Connect GitHub"
                onPress={connect}>
                Connect
              </Stack.Toolbar.Button>
            </Stack.Toolbar>
            <SettingsGroup footer="Pick the repositories you want, then set Issues to Read and write. Classic tokens with the repo scope work too.">
              <SettingsLinkRow
                title="Create a Token on GitHub"
                onPress={() => Linking.openURL(GITHUB_NEW_TOKEN_URL)}
              />
            </SettingsGroup>
            <SettingsGroup
              title="Personal Access Token"
              footer={
                connection.connectionError ? (
                  <Text style={{ color: colors.danger }}>{connection.connectionError}</Text>
                ) : connection.patPending ? (
                  'Checking the token with GitHub…'
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
        visible={removing != null}
        title={
          removing === 'all'
            ? multiple
              ? 'Disconnect every GitHub account?'
              : 'Disconnect GitHub?'
            : `Remove @${removing?.login ?? ''}?`
        }
        message={
          removing === 'all'
            ? 'Tokens are removed from this device. Your repositories stay saved for when you reconnect.'
            : "Its token is removed from this device. Repositories it added stay, read with your other account."
        }
        confirmLabel={removing === 'all' ? 'Disconnect' : 'Remove'}
        dismissLabel="Cancel"
        onDismiss={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          void connection.disconnect(target === 'all' ? undefined : (target ?? undefined));
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
