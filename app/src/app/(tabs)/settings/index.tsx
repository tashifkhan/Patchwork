import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { RowSeparator, SettingsGroup, SettingsRow, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { getAccounts, getGeminiApiKey, type CalDavAccount } from '@/lib/credentials';
import { useGitHubSessionStore } from '@/stores/github-session-store';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

export default function SettingsHub() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';

  const [accounts, setAccounts] = useState<CalDavAccount[]>([]);
  const [hasGemini, setHasGemini] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const githubConnection = useGitHubSessionStore((state) => state.state);
  const githubReposCount = useSettingsStore((s) => s.githubRepositories.length);

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
                onPress={() => router.push({ pathname: '/settings/account', params: { id: account.id } })}
              />
            </View>
          ))}
          {accounts.length > 0 ? <RowSeparator /> : null}
          <SettingsRow
            icon="plus"
            title="Add account"
            onPress={() => router.push('/settings/account')}
          />
        </SettingsGroup>
      ) : null}

      <SettingsGroup>
        <SettingsRow
          icon="palette-outline"
          title="Look and feel"
          subtitle={
            Platform.OS === 'android'
              ? 'Theme, palettes, AMOLED, floating bar'
              : 'Theme, palettes, AMOLED, contrast'
          }
          showChevron
          onPress={() => router.push('/settings/appearance')}
        />
        <RowSeparator />
        <SettingsRow
          icon="bell-outline"
          title="Notifications"
          subtitle="Reminders and lead time"
          showChevron
          onPress={() => router.push('/settings/notifications')}
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
          onPress={() => router.push('/settings/github')}
        />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          icon="star-four-points-outline"
          title="AI import"
          subtitle={hasGemini ? 'Gemini key saved' : 'Set up Gemini for image import'}
          showChevron
          onPress={() => router.push('/settings/ai')}
        />
        <RowSeparator />
        <SettingsRow
          icon="refresh"
          title="Refresh all data"
          onPress={async () => {
            setRefreshMessage(null);
            try {
              await queryClient.invalidateQueries({ predicate: (query) =>
                ['tasks', 'task-lists', 'deck', 'github'].includes(String(query.queryKey[0]))
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
