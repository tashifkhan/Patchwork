import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Fragment, useEffect, useState } from 'react';
import { Linking, Platform, Pressable } from 'react-native';

import { JIRA_NEW_TOKEN_URL } from '@/api/jira';
import {
  RowSeparator,
  SETTINGS_IOS,
  SettingsActionRow,
  SettingsGroup,
  SettingsLinkRow,
  SettingsRow,
  SettingsScreen,
  SettingsTextField,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { JIRA_SCOPES } from '@/components/boards/filter-sheet';
import { useJiraBoards } from '@/hooks/use-boards';
import type { JiraCredentials } from '@/lib/credentials-types';
import { haptics } from '@/lib/haptics';
import { useJiraSessionStore } from '@/stores/jira-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

/**
 * Jira Cloud, connected with Atlassian API tokens. Disconnected, the page is
 * a three-step setup; connected, it lists every login (several sites, or
 * several people on one site), the boards they bring in, and which issues
 * load.
 */
export default function JiraSettingsScreen() {
  const { colors } = useTheme();
  const state = useJiraSessionStore((s) => s.state);
  const initialize = useJiraSessionStore((s) => s.initialize);
  const connect = useJiraSessionStore((s) => s.connect);
  const disconnect = useJiraSessionStore((s) => s.disconnect);
  const disconnectAll = useJiraSessionStore((s) => s.disconnectAll);
  const boards = useJiraBoards();
  const scope = useSettingsStore((s) => s.jiraIssueScope);
  const setScope = useSettingsStore((s) => s.setJiraIssueScope);

  const accounts = state.status === 'connected' ? state.accounts : [];
  const expired = state.status === 'connected' ? state.expired : {};
  // The form is open while nothing is connected, or after "Add account".
  const [adding, setAdding] = useState(false);
  const [site, setSite] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<JiraCredentials | 'all' | null>(null);

  useEffect(() => {
    if (state.status === 'initializing') void initialize();
  }, [initialize, state.status]);

  async function submit() {
    if (Platform.OS === 'web') {
      setError('Jira works in the iOS and Android apps. Jira blocks requests from browsers.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await connect({ site, email, apiToken: token });
      haptics.success();
      setToken('');
      setSite('');
      setEmail('');
      setAdding(false);
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : 'Could not connect to Jira.');
    } finally {
      setPending(false);
    }
  }

  /** Open the form filled in for a login, to paste a fresh token. */
  function reconnect(account: JiraCredentials) {
    haptics.tap();
    setSite(account.site.replace(/^https:\/\//, ''));
    setEmail(account.email);
    setToken('');
    setError(null);
    setAdding(true);
  }

  if (state.status === 'initializing') {
    return <LoadingState message="Checking Jira…" fullScreen />;
  }

  const connected = accounts.length > 0;
  const only = accounts.length === 1 ? accounts[0] : undefined;
  const showForm = !connected || adding;
  const boardCount = boards.data?.length ?? 0;
  const expiredCount = Object.keys(expired).length;

  return (
    <>
      <Stack.Screen options={{ title: 'Jira', headerLargeTitle: false }} />
      <SettingsScreen>
        <View className="items-center gap-3" style={{ paddingTop: 8 }}>
          {only?.account.avatarUrl ? (
            <Image
              source={{ uri: only.account.avatarUrl }}
              style={{ width: 72, height: 72, borderRadius: 36 }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: SETTINGS_IOS ? 16 : 24,
                borderCurve: 'continuous',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: SETTINGS_IOS ? '#1868DB' : colors.primaryContainer,
              }}>
              <MaterialCommunityIcons
                name="jira"
                size={40}
                color={SETTINGS_IOS ? '#FFFFFF' : colors.onPrimaryContainer}
              />
            </View>
          )}
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>
            {only ? only.account.displayName : connected ? `${accounts.length} Jira accounts` : 'Jira boards'}
          </Text>
          <Text
            style={{ fontSize: 15, lineHeight: 21, color: colors.text2, textAlign: 'center', maxWidth: 320 }}>
            {connected
              ? 'Your Jira boards sit next to Deck in the Boards tab. Moving a card there moves the issue in Jira.'
              : 'See your Jira Cloud boards, move issues between columns and create new ones. Tokens stay encrypted on this device.'}
          </Text>
        </View>

        {connected ? (
          <>
            <SettingsGroup
              title="Accounts"
              footer={
                expiredCount > 0
                  ? 'Tap an account that stopped working to paste a new token.'
                  : 'Connect another site, or another person on the same site.'
              }>
              {accounts.map((account, index) => (
                <Fragment key={account.id}>
                  {index > 0 ? <RowSeparator /> : null}
                  <SettingsRow
                    leading={<AccountAvatar account={account} />}
                    title={account.account.displayName}
                    subtitle={
                      expired[account.id]
                        ? 'Needs a new API token'
                        : `${account.site.replace(/^https:\/\//, '')} · ${account.email}`
                    }
                    danger={!!expired[account.id]}
                    onPress={() => reconnect(account)}
                    trailing={
                      <RemoveButton
                        label={`Remove ${account.account.displayName}`}
                        onPress={() => setRemoving(account)}
                      />
                    }
                  />
                </Fragment>
              ))}
              {!adding ? (
                <>
                  <RowSeparator />
                  <SettingsRow
                    icon="plus"
                    title="Add account"
                    onPress={() => {
                      haptics.tap();
                      setSite('');
                      setEmail('');
                      setToken('');
                      setError(null);
                      setAdding(true);
                    }}
                  />
                </>
              ) : null}
            </SettingsGroup>

            <SettingsGroup title="Boards">
              <SettingsRow
                icon="view-column-outline"
                title={
                  boards.isLoading
                    ? 'Loading boards…'
                    : `${boardCount} board${boardCount === 1 ? '' : 's'}`
                }
                subtitle={boards.error instanceof Error ? boards.error.message : 'Open the Boards tab'}
                showChevron
                onPress={() => router.navigate('/deck')}
              />
              <RowSeparator />
              <SettingsRow
                icon="refresh"
                title="Refresh boards"
                onPress={() => {
                  haptics.tap();
                  void boards.refetch();
                }}
              />
            </SettingsGroup>
            {/* Which issues load on every Jira board. */}
            <SettingsGroup
              title="Show issues"
              footer="Boards only load these issues. Use the filter button on a board to narrow further.">
              {JIRA_SCOPES.map((option) => (
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
          </>
        ) : null}

        {showForm ? (
          <>
            {SETTINGS_IOS ? (
              // iOS form pattern: the confirm action lives in the navigation bar.
              <Stack.Toolbar placement="right">
                <Stack.Toolbar.Button
                  variant="done"
                  disabled={!site.trim() || !email.trim() || !token.trim() || pending}
                  accessibilityLabel="Connect Jira"
                  onPress={submit}>
                  Connect
                </Stack.Toolbar.Button>
              </Stack.Toolbar>
            ) : null}
            {SETTINGS_IOS ? (
              <SettingsGroup footer="Name it Patchwork and copy it. Your site is the address you open Jira at.">
                <SettingsLinkRow title="Create an API Token" onPress={() => Linking.openURL(JIRA_NEW_TOKEN_URL)} />
              </SettingsGroup>
            ) : !connected ? (
              <SettingsGroup title="Connect in three steps">
                <SettingsRow
                  leading={<NumberTile n={1} />}
                  title="Create an API token"
                  subtitle="Opens id.atlassian.com. Name it Patchwork and copy it."
                  onPress={() => Linking.openURL(JIRA_NEW_TOKEN_URL)}
                  trailing={
                    SETTINGS_IOS ? (
                      <SymbolView name="arrow.up.right" size={14} weight="semibold" tintColor={colors.text3} />
                    ) : (
                      <MaterialCommunityIcons name="open-in-new" size={20} color={colors.text2} />
                    )
                  }
                />
                <RowSeparator />
                <SettingsRow
                  leading={<NumberTile n={2} />}
                  title="Enter your site and email"
                  subtitle="The address you open Jira at, and the email you sign in with."
                />
                <RowSeparator />
                <SettingsRow leading={<NumberTile n={3} />} title="Paste the token below" />
              </SettingsGroup>
            ) : null}

            <SettingsGroup
              title={SETTINGS_IOS ? (connected ? 'New Account' : 'Account') : connected ? 'Add or reconnect an account' : 'Jira Cloud'}
              footer={
                error ? (
                  <Text style={{ color: colors.danger }}>{error}</Text>
                ) : SETTINGS_IOS ? (
                  pending ? (
                    'Checking with Jira…'
                  ) : connected ? (
                    'A login you already have gets its token replaced. Stored encrypted on this device.'
                  ) : (
                    'Stored encrypted on this device.'
                  )
                ) : connected ? (
                  <Text style={{ color: colors.text2 }}>
                    Create a token at{' '}
                    <Text style={{ color: colors.accent }} onPress={() => Linking.openURL(JIRA_NEW_TOKEN_URL)}>
                      id.atlassian.com
                    </Text>
                    . A login you already have gets its token replaced.
                  </Text>
                ) : (
                  'Stored encrypted on this device.'
                )
              }>
              <SettingsTextField
                label="Site"
                icon="web"
                value={site}
                onChangeText={(value) => {
                  setSite(value);
                  if (error) setError(null);
                }}
                placeholder="your-team.atlassian.net"
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="next"
              />
              <RowSeparator />
              <SettingsTextField
                label="Email"
                icon="email-outline"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  if (error) setError(null);
                }}
                placeholder="you@company.com"
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
              />
              <RowSeparator />
              <SettingsTextField
                label={SETTINGS_IOS ? 'API Token' : 'API token'}
                icon="key-variant"
                value={token}
                onChangeText={(value) => {
                  setToken(value);
                  if (error) setError(null);
                }}
                onSubmitEditing={submit}
                placeholder="ATATT…"
                secureTextEntry
                autoCapitalize="none"
                returnKeyType="go"
                mono
              />
              {SETTINGS_IOS ? null : (
                <>
                  <RowSeparator />
                  <SettingsActionRow
                    title={pending ? 'Checking…' : 'Connect'}
                    variant="filled"
                    androidIcon="jira"
                    onPress={submit}
                    disabled={!site.trim() || !email.trim() || !token.trim()}
                    loading={pending}
                  />
                </>
              )}
              {connected ? (
                <>
                  <RowSeparator />
                  <SettingsActionRow
                    title="Cancel"
                    onPress={() => {
                      setAdding(false);
                      setError(null);
                      setToken('');
                    }}
                  />
                </>
              ) : null}
            </SettingsGroup>
          </>
        ) : null}

        {accounts.length > 1 ? (
          <SettingsGroup>
            <SettingsRow icon="logout" title="Disconnect all" danger onPress={() => setRemoving('all')} />
          </SettingsGroup>
        ) : null}
      </SettingsScreen>

      <NativeAlert
        visible={removing != null}
        title={
          removing === 'all'
            ? 'Disconnect every Jira account?'
            : `Remove ${removing?.account.displayName ?? 'account'}?`
        }
        message={
          removing === 'all'
            ? 'All tokens are removed from this device and Jira boards leave the Boards tab.'
            : "The token is removed from this device and that account's boards leave the Boards tab."
        }
        confirmLabel={removing === 'all' ? 'Disconnect' : 'Remove'}
        dismissLabel="Cancel"
        onDismiss={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          setRemoving(null);
          if (target === 'all') void disconnectAll();
          else if (target) void disconnect(target.id);
        }}
      />
    </>
  );
}

function AccountAvatar({ account }: { account: JiraCredentials }) {
  const { colors } = useTheme();
  const size = SETTINGS_IOS ? 30 : 40;
  if (account.account.avatarUrl) {
    return (
      <Image
        source={{ uri: account.account.avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: SETTINGS_IOS ? '#1868DB' : colors.primaryContainer,
      }}>
      <MaterialCommunityIcons name="jira" size={size * 0.55} color={SETTINGS_IOS ? '#FFFFFF' : colors.onPrimaryContainer} />
    </View>
  );
}

export function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      {SETTINGS_IOS ? (
        <SymbolView name="xmark.circle.fill" size={20} tintColor={colors.text3} />
      ) : (
        <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
      )}
    </Pressable>
  );
}

function NumberTile({ n }: { n: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: SETTINGS_IOS ? 30 : 40,
        height: SETTINGS_IOS ? 30 : 40,
        borderRadius: SETTINGS_IOS ? 7 : 20,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: SETTINGS_IOS ? colors.accent : colors.primaryContainer,
      }}>
      <Text
        style={{
          color: SETTINGS_IOS ? colors.onAccent : colors.onPrimaryContainer,
          fontSize: 15,
          fontWeight: '700',
        }}>
        {n}
      </Text>
    </View>
  );
}
