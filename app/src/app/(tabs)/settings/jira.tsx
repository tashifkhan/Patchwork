import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { JIRA_NEW_TOKEN_URL } from '@/api/jira';
import {
  RowSeparator,
  SETTINGS_IOS,
  SettingsActionRow,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
  SettingsTextField,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { JIRA_SCOPES } from '@/components/boards/filter-sheet';
import { useJiraBoards } from '@/hooks/use-boards';
import { haptics } from '@/lib/haptics';
import { useJiraSessionStore } from '@/stores/jira-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

/**
 * Jira Cloud, connected with an Atlassian API token. Disconnected, the page
 * is a three-step setup; connected, it shows the account and how many boards
 * appear in the Boards tab.
 */
export default function JiraSettingsScreen() {
  const { colors } = useTheme();
  const state = useJiraSessionStore((s) => s.state);
  const initialize = useJiraSessionStore((s) => s.initialize);
  const connect = useJiraSessionStore((s) => s.connect);
  const disconnect = useJiraSessionStore((s) => s.disconnect);
  const boards = useJiraBoards();
  const scope = useSettingsStore((s) => s.jiraIssueScope);
  const setScope = useSettingsStore((s) => s.setJiraIssueScope);

  const saved = state.status === 'connected' || state.status === 'expired' ? state.credentials : null;
  // Untouched fields fall back to the saved site and email, for reconnecting.
  const [siteInput, setSite] = useState<string | null>(null);
  const [emailInput, setEmail] = useState<string | null>(null);
  const site = siteInput ?? saved?.site.replace(/^https:\/\//, '') ?? '';
  const email = emailInput ?? saved?.email ?? '';
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

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
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : 'Could not connect to Jira.');
    } finally {
      setPending(false);
    }
  }

  if (state.status === 'initializing') {
    return <LoadingState message="Checking Jira…" fullScreen />;
  }

  const connected = state.status === 'connected';
  const account = saved?.account;
  const boardCount = boards.data?.length ?? 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Jira', headerLargeTitle: false }} />
      <SettingsScreen>
        <View className="items-center gap-3" style={{ paddingTop: 8 }}>
          {connected && account?.avatarUrl ? (
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
                borderCurve: 'continuous',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: SETTINGS_IOS ? '#2684FF' : colors.primaryContainer,
              }}>
              <MaterialCommunityIcons
                name="jira"
                size={40}
                color={SETTINGS_IOS ? '#FFFFFF' : colors.onPrimaryContainer}
              />
            </View>
          )}
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>
            {connected && account ? account.displayName : 'Jira boards'}
          </Text>
          <Text
            style={{ fontSize: 15, lineHeight: 21, color: colors.text2, textAlign: 'center', maxWidth: 320 }}>
            {connected
              ? `${saved?.site.replace(/^https:\/\//, '')}. Your Jira boards sit next to Deck in the Boards tab, showing only your issues. Moving a card there moves the issue in Jira.`
              : state.status === 'expired'
                ? state.message
                : 'See your Jira Cloud boards, move issues between columns and create new ones. The token stays encrypted on this device.'}
          </Text>
        </View>

        {connected ? (
          <>
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
            {/* Whose issues load on every Jira board. Never the whole board. */}
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
            <SettingsGroup>
              <SettingsRow
                icon="logout"
                title="Disconnect Jira"
                danger
                onPress={() => setConfirmDisconnect(true)}
              />
            </SettingsGroup>
          </>
        ) : (
          <>
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

            <SettingsGroup
              title="Jira Cloud"
              footer={
                error ? <Text style={{ color: colors.danger }}>{error}</Text> : 'Stored encrypted on this device.'
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
                label="API token"
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
              <RowSeparator />
              <SettingsActionRow
                title={pending ? 'Checking…' : 'Connect'}
                variant="filled"
                androidIcon="jira"
                onPress={submit}
                disabled={!site.trim() || !email.trim() || !token.trim()}
                loading={pending}
              />
            </SettingsGroup>

            {state.status === 'expired' ? (
              <SettingsGroup>
                <SettingsRow
                  icon="logout"
                  title="Disconnect Jira"
                  danger
                  onPress={() => setConfirmDisconnect(true)}
                />
              </SettingsGroup>
            ) : null}
          </>
        )}
      </SettingsScreen>

      <NativeAlert
        visible={confirmDisconnect}
        title="Disconnect Jira?"
        message="The token is removed from this device and Jira boards leave the Boards tab."
        confirmLabel="Disconnect"
        dismissLabel="Cancel"
        onDismiss={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setConfirmDisconnect(false);
          setToken('');
          void disconnect();
        }}
      />
    </>
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
