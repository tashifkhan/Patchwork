import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { RowSeparator, SettingsGroup, SettingsRow, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { getAccounts, getGeminiApiKey, getGitHubCredentials, type CalDavAccount } from '@/lib/credentials';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

export default function SettingsHub() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';

  const [accounts, setAccounts] = useState<CalDavAccount[]>([]);
  const [hasGemini, setHasGemini] = useState(false);
  const githubConnected = useSettingsStore((s) => s.githubConnected);
  const githubReposCount = useSettingsStore((s) => s.githubRepos.length);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getAccounts(), getGeminiApiKey(), getGitHubCredentials()]).then(([list, gemini, github]) => {
        if (!active) return;
        setAccounts(list);
        setHasGemini(!!gemini);
        useSettingsStore.getState().setGitHubConnected(!!github);
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
          subtitle="Theme, accent, true black"
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
          subtitle={githubConnected ? `${githubReposCount} repos connected` : 'Connect your account'}
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
          onPress={() => queryClient.invalidateQueries()}
        />
      </SettingsGroup>

      <Text className="text-sf-text-3 self-center pt-1 text-xs" style={{ fontVariant: ['tabular-nums'] }}>
        {Constants.expoConfig?.name ?? 'Patchwork'} · v{Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </SettingsScreen>
  );
}
