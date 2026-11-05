import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { type Href, Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RowSeparator, SettingsGroup, SettingsRow, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { useAdaptiveLayout } from '@/hooks/use-adaptive-layout';
import { getAccounts, getGeminiApiKey, type CalDavAccount } from '@/lib/credentials';
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
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon="github"
          title="GitHub Issues"
          subtitle={
            githubConnection.status === 'connected'
              ? `${githubReposCount} repositories selected`
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
            jiraConnection.status === 'connected'
              ? `${jiraConnection.credentials.account.displayName} · ${jiraConnection.credentials.site.replace(/^https:\/\//, '')}`
              : jiraConnection.status === 'expired'
                ? 'Connection needs attention'
                : 'Bring your Jira boards into Boards'
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
