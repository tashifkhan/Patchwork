import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { type Href, Redirect, useFocusEffect, useRouter } from 'expo-router';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RowSeparator,
  SettingsActionRow,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { getAccounts, getGeminiApiKey, type CalDavAccount } from '@/lib/credentials';
import { useOutboxStore } from '@/lib/outbox';
import { useGitHubSessionStore } from '@/stores/github-session-store';
import { useJiraSessionStore } from '@/stores/jira-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

/**
 * The Settings tab's root route. In the split view (iPad, unfolded
 * foldables, tablets) the hub is the leading pane drawn by the layout, so the
 * stack on the right opens straight onto the first page instead.
 */
export default function SettingsIndexRoute() {
  const { twoPane } = useAdaptiveLayout();
  if (twoPane) return <Redirect href="/settings/appearance" />;
  return <SettingsHub />;
}

/**
 * The list of settings pages. `embedded` = drawn as the split view's leading
 * pane: it gets its own title, and picking a page replaces whatever the
 * trailing pane shows instead of pushing on top of it.
 */
export function SettingsHub({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const go = (href: Href) => {
    if (!embedded) {
      router.push(href);
      return;
    }
    if (router.canDismiss()) router.dismissAll();
    router.replace(href);
  };
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';

  const [accounts, setAccounts] = useState<CalDavAccount[]>([]);
  const [hasGemini, setHasGemini] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const githubConnection = useGitHubSessionStore((state) => state.state);
  const githubReposCount = useSettingsStore((s) => s.githubRepositories.length);
  const jiraConnection = useJiraSessionStore((state) => state.state);
  const outboxCount = useOutboxStore((state) => state.entries.length);
  const initializeJira = useJiraSessionStore((state) => state.initialize);
  useEffect(() => {
    if (jiraConnection.status === 'initializing') void initializeJira();
  }, [initializeJira, jiraConnection.status]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getAccounts(), getGeminiApiKey()]).then(([list, gemini]) => {
        if (!active) return;
        setAccounts(list);
        setHasGemini(!!gemini);
      }).catch((error) => {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Settings could not be loaded.');
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const versionLine = `${Constants.expoConfig?.name ?? 'Patchwork'} · v${Constants.expoConfig?.version ?? '1.0.0'}`;

  async function refreshAll() {
    setRefreshMessage(null);
    try {
      await queryClient.invalidateQueries({
        predicate: (query) =>
          ['tasks', 'task-lists', 'deck', 'github', 'jira'].includes(String(query.queryKey[0])),
      });
      setRefreshMessage('Refresh completed.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Refresh failed.');
    }
  }

  if (Platform.OS === 'ios') {
    // iOS Settings layout: colored SF Symbol tiles, real brand logos, a short
    // status on the right instead of a sentence underneath, section titles,
    // and plain tinted button rows for actions.
    const githubValue =
      githubConnection.status === 'connected'
        ? `${githubReposCount} ${githubReposCount === 1 ? 'Repo' : 'Repos'}`
        : githubConnection.status === 'expired'
          ? 'Reconnect'
          : githubReposCount > 0
            ? `${githubReposCount} Public`
            : 'Off';
    const jiraValue =
      jiraConnection.status !== 'connected'
        ? 'Off'
        : Object.keys(jiraConnection.expired).length > 0
          ? 'Reconnect'
          : jiraConnection.accounts.length > 1
            ? `${jiraConnection.accounts.length} Accounts`
            : 'On';
    return (
      <SettingsScreen>
        {embedded ? (
          <Text
            accessibilityRole="header"
            style={{ paddingTop: insets.top + 12, paddingHorizontal: 4, fontSize: 34, fontWeight: '700', color: colors.text }}>
            Settings
          </Text>
        ) : null}

        <SettingsGroup title="Accounts">
          {accounts.map((account) => (
            <Fragment key={account.id}>
              <SettingsRow
                icon="server"
                sf="server.rack"
                title={account.displayName}
                subtitle={account.baseUrl.replace(/^https?:\/\//, '')}
                showChevron
                onPress={() => go({ pathname: '/settings/account', params: { id: account.id } })}
              />
              <RowSeparator />
            </Fragment>
          ))}
          <SettingsActionRow title="Add Account" onPress={() => go('/settings/account')} />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="palette-outline"
            sf="paintpalette.fill"
            title="Appearance"
            showChevron
            onPress={() => go('/settings/appearance')}
          />
          <RowSeparator />
          <SettingsRow
            icon="bell-outline"
            title="Notifications"
            showChevron
            onPress={() => go('/settings/notifications')}
          />
          <RowSeparator />
          <SettingsRow
            icon="cloud-sync-outline"
            sf="icloud.and.arrow.up"
            title="Offline & Sync"
            value={outboxCount > 0 ? `${outboxCount} Waiting` : undefined}
            showChevron
            onPress={() => go('/settings/offline')}
          />
        </SettingsGroup>

        <SettingsGroup title="Integrations">
          <SettingsRow
            leading={<BrandTile icon="github" background="#24292F" />}
            title="GitHub"
            value={githubValue}
            showChevron
            onPress={() => go('/settings/github')}
          />
          <RowSeparator />
          <SettingsRow
            leading={<BrandTile icon="jira" background="#1868DB" />}
            title="Jira"
            value={jiraValue}
            showChevron
            onPress={() => go('/settings/jira')}
          />
          <RowSeparator />
          <SettingsRow
            icon="star-four-points-outline"
            title="AI Import"
            value={hasGemini ? 'On' : 'Off'}
            showChevron
            onPress={() => go('/settings/ai')}
          />
        </SettingsGroup>

        <SettingsGroup
          footer={
            errorMessage ? (
              <Text style={{ color: colors.danger }}>{errorMessage}</Text>
            ) : (
              (refreshMessage ?? undefined)
            )
          }>
          <SettingsActionRow title="Refresh All Data" onPress={refreshAll} />
        </SettingsGroup>

        <Text style={{ textAlign: 'center', fontSize: 13, color: colors.text3 }}>
          {versionLine}
        </Text>
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen>
      {embedded ? (
        <Text
          accessibilityRole="header"
          style={{
            paddingTop: insets.top + 12,
            paddingHorizontal: 4,
            fontSize: Platform.OS === 'ios' ? 34 : 28,
            fontWeight: Platform.OS === 'ios' ? '700' : '500',
            color: colors.text,
          }}>
          Settings
        </Text>
      ) : null}
      {!isWeb ? (
        <SettingsGroup>
          {accounts.map((account, index) => (
            <View key={account.id}>
              {index > 0 ? <RowSeparator /> : null}
              <SettingsRow
                icon="cloud-check-outline"
                iconColor={colors.accent}
                title={account.displayName}
                subtitle={account.baseUrl.replace(/^https?:\/\//, '')}
                onPress={() => go({ pathname: '/settings/account', params: { id: account.id } })}
              />
            </View>
          ))}
          {accounts.length > 0 ? <RowSeparator /> : null}
          <SettingsRow
            icon="plus"
            title="Add account"
            onPress={() => go('/settings/account')}
          />
        </SettingsGroup>
      ) : null}

      <SettingsGroup>
        <SettingsRow
          icon="palette-outline"
          title="Look and feel"
          subtitle={
            Platform.OS === 'android'
              ? 'Theme, palettes, AMOLED, floating navbar'
              : 'Theme, palettes, AMOLED, contrast'
          }
          showChevron
          onPress={() => go('/settings/appearance')}
        />
        <RowSeparator />
        <SettingsRow
          icon="bell-outline"
          title="Notifications"
          subtitle="Reminders and lead time"
          showChevron
          onPress={() => go('/settings/notifications')}
        />
        {!isWeb ? (
          <>
            <RowSeparator />
            <SettingsRow
              icon="cloud-sync-outline"
              title="Offline and sync"
              subtitle={
                outboxCount > 0
                  ? `${outboxCount} item${outboxCount === 1 ? '' : 's'} waiting to sync`
                  : 'On-device lists and items saved offline'
              }
              showChevron
              onPress={() => go('/settings/offline')}
            />
          </>
        ) : null}
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon="github"
          title="GitHub Issues"
          subtitle={
            githubConnection.status === 'connected'
              ? githubConnection.accounts.length > 1
                ? `${githubConnection.accounts.length} accounts · ${githubReposCount} repositories`
                : `${githubReposCount} repositories selected`
              : githubConnection.status === 'expired'
                ? 'Connection needs attention'
                : githubReposCount > 0
                  ? `${githubReposCount} public repositories`
                  : 'Connect GitHub or add a public repository'
          }
          showChevron
          onPress={() => go('/settings/github')}
        />
        <RowSeparator />
        <SettingsRow
          icon="jira"
          title="Jira"
          subtitle={
            jiraConnection.status !== 'connected'
              ? 'Bring your Jira boards into Boards'
              : Object.keys(jiraConnection.expired).length > 0
                ? 'Connection needs attention'
                : jiraConnection.accounts.length > 1
                  ? `${jiraConnection.accounts.length} accounts`
                  : `${jiraConnection.accounts[0].account.displayName} · ${jiraConnection.accounts[0].site.replace(/^https:\/\//, '')}`
          }
          showChevron
          onPress={() => go('/settings/jira')}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon="star-four-points-outline"
          title="AI import"
          subtitle={hasGemini ? 'Gemini key saved' : 'Set up Gemini for image import'}
          showChevron
          onPress={() => go('/settings/ai')}
        />
        <RowSeparator />
        <SettingsRow
          icon="refresh"
          title="Refresh all data"
          onPress={async () => {
            setRefreshMessage(null);
            try {
              await queryClient.invalidateQueries({ predicate: (query) =>
                ['tasks', 'task-lists', 'deck', 'github', 'jira'].includes(String(query.queryKey[0]))
              });
              setRefreshMessage('Refresh completed.');
            } catch (error) {
              setErrorMessage(error instanceof Error ? error.message : 'Refresh failed.');
            }
          }}
        />
      </SettingsGroup>

      {errorMessage ? <Text selectable className="text-sf-red px-2 text-sm">{errorMessage}</Text> : null}
      {refreshMessage ? <Text selectable className="text-sf-green px-2 text-sm">{refreshMessage}</Text> : null}

      <Text className="text-sf-text-3 self-center pt-1 text-xs" style={{ fontVariant: ['tabular-nums'] }}>
        {Constants.expoConfig?.name ?? 'Patchwork'} · v{Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </SettingsScreen>
  );
}

/** A settings tile with a brand's own logo (GitHub, Jira), sized like the SF Symbol tiles. */
function BrandTile({
  icon,
  background,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  background: string;
}) {
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        borderCurve: 'continuous',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background,
      }}>
      <MaterialCommunityIcons name={icon} size={20} color="#FFFFFF" />
    </View>
  );
}
