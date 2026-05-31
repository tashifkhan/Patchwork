import SegmentedControl from '@expo/ui/community/segmented-control';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable } from 'react-native';

import { SettingsGroup, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { Icon } from '@/components/ui/icon';
import { NativeAlert } from '@/components/ui/native-alert';
import { Switch } from '@/components/ui/switch';
import { useGitHubRepos } from '@/hooks/use-github';
import { queryKeys } from '@/lib/query-client';
import {
  clearGitHubCredentials,
  getGitHubCredentials,
  saveGitHubCredentials,
  type GitHubCredentials,
} from '@/lib/credentials';
import {
  isOAuthAvailable,
  pollForAccessToken,
  requestDeviceCode,
  validatePat,
} from '@/lib/github-auth';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function GitHubSettingsScreen() {
  const { colors, scheme } = useTheme();
  const queryClient = useQueryClient();
  const githubRepos = useSettingsStore((s) => s.githubRepos);
  const setGitHubConnected = useSettingsStore((s) => s.setGitHubConnected);
  const setGitHubRepos = useSettingsStore((s) => s.setGitHubRepos);

  const reposQuery = useGitHubRepos();

  const [creds, setCreds] = useState<GitHubCredentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState<'oauth' | 'pat'>(isOAuthAvailable() ? 'oauth' : 'pat');
  const [patInput, setPatInput] = useState('');
  const [patLoading, setPatLoading] = useState(false);
  const [deviceFlowState, setDeviceFlowState] = useState<{ userCode: string; url: string } | null>(
    null
  );
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    getGitHubCredentials().then((loaded) => {
      if (!mounted) return;
      setCreds(loaded);
      setGitHubConnected(!!loaded);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [setGitHubConnected]);

  const handleDisconnect = async () => {
    await clearGitHubCredentials();
    setGitHubConnected(false);
    setGitHubRepos([]);
    setCreds(null);
    queryClient.removeQueries({ queryKey: queryKeys.githubIssues });
    queryClient.removeQueries({ queryKey: queryKeys.githubRepos });
  };

  const handleStartOAuth = async () => {
    try {
      const response = await requestDeviceCode();
      setDeviceFlowState({ userCode: response.user_code, url: response.verification_uri });
      const token = await pollForAccessToken(response.device_code, response.interval);
      const userCreds = await validatePat(token);
      userCreds.method = 'oauth';
      await saveGitHubCredentials(userCreds);
      setCreds(userCreds);
      setGitHubConnected(true);
      setDeviceFlowState(null);
    } catch (e) {
      setDeviceFlowState(null);
      setAlert({ title: 'OAuth Error', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const handleSavePat = async () => {
    setPatLoading(true);
    try {
      const userCreds = await validatePat(patInput);
      await saveGitHubCredentials(userCreds);
      setCreds(userCreds);
      setGitHubConnected(true);
      setPatInput('');
    } catch (e) {
      setAlert({
        title: 'Invalid Token',
        message: e instanceof Error ? e.message : 'Failed to validate token.',
      });
    } finally {
      setPatLoading(false);
    }
  };

  const toggleRepo = (repoFullName: string) => {
    const next = githubRepos.includes(repoFullName)
      ? githubRepos.filter((r) => r !== repoFullName)
      : [...githubRepos, repoFullName];
    setGitHubRepos(next);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <SettingsScreen>
        {creds ? (
          <>
            <SettingsGroup>
              <View className="items-center justify-center gap-3 py-6">
                <Image
                  source={{ uri: creds.avatarUrl }}
                  className="h-20 w-20 rounded-full"
                  style={{ backgroundColor: colors.bg2 }}
                />
                <View className="items-center">
                  <Text className="text-sf-text text-lg font-semibold">@{creds.login}</Text>
                  <Text className="text-sf-text-2 text-sm uppercase">Connected via {creds.method}</Text>
                </View>
                <Pressable
                  onPress={handleDisconnect}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.danger })}>
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Disconnect</Text>
                </Pressable>
              </View>
            </SettingsGroup>

            <SettingsGroup title="Repositories to Sync">
              {reposQuery.isLoading ? (
                <View className="p-4 items-center">
                  <ActivityIndicator color={colors.text2} />
                </View>
              ) : reposQuery.data && reposQuery.data.length > 0 ? (
                reposQuery.data.map((repo, i) => (
                  <View key={repo.full_name}>
                    {i > 0 && <View className="h-px bg-sf-separator ml-4" />}
                    <Pressable
                      onPress={() => toggleRepo(repo.full_name)}
                      style={({ pressed }) => ({
                        opacity: pressed ? 0.7 : 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 16,
                      })}>
                      <View className="flex-1 gap-1 pr-4">
                        <Text className="text-sf-text text-base">{repo.full_name}</Text>
                        {repo.description ? (
                          <Text numberOfLines={1} className="text-sf-text-2 text-sm">
                            {repo.description}
                          </Text>
                        ) : null}
                      </View>
                      <Switch value={githubRepos.includes(repo.full_name)} onValueChange={() => toggleRepo(repo.full_name)} />
                    </Pressable>
                  </View>
                ))
              ) : (
                <View className="p-4 items-center">
                  <Text className="text-sf-text-2 text-sm">No repositories found.</Text>
                </View>
              )}
            </SettingsGroup>
          </>
        ) : (
          <>
            <View className="px-4 py-2 pb-4">
              <Text className="text-sf-text-2 text-sm text-center">
                View and manage issues assigned to you directly in your tasks list.
              </Text>
            </View>

            <SettingsGroup>
              <View className="px-4 py-4 gap-4">
                <SegmentedControl
                  appearance={scheme}
                  values={['OAuth', 'Access Token']}
                  selectedIndex={method === 'oauth' ? 0 : 1}
                  tintColor={colors.accent}
                  onChange={(event) =>
                    setMethod(event.nativeEvent.selectedSegmentIndex === 0 ? 'oauth' : 'pat')
                  }
                />

                {method === 'oauth' ? (
                  <View className="gap-4 pt-2">
                    {!isOAuthAvailable() ? (
                      <View className="rounded-xl p-4 gap-2" style={{ backgroundColor: `${colors.danger}20` }}>
                        <Text style={{ color: colors.danger, fontWeight: '600' }}>Not Configured</Text>
                        <Text className="text-sf-text">
                          OAuth is not configured in this build. Please set EXPO_PUBLIC_GITHUB_CLIENT_ID or use a Personal Access Token instead.
                        </Text>
                      </View>
                    ) : (
                      <Pressable
                        onPress={handleStartOAuth}
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#24292f', paddingVertical: 12, borderRadius: 8 })}>
                        <MaterialCommunityIcons name="github" size={20} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '600' }}>Connect with GitHub</Text>
                      </Pressable>
                    )}
                  </View>
                ) : (
                  <View className="gap-4 pt-2">
                    <Text className="text-sf-text-2 text-sm">
                      Create a Personal Access Token (classic or fine-grained) with 'repo' scope.
                    </Text>
                    <TextInput
                      value={patInput}
                      onChangeText={setPatInput}
                      placeholder="ghp_..."
                      placeholderTextColor={colors.gray}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      className="rounded-xl px-4 py-3 text-base text-sf-text"
                      style={{ backgroundColor: colors.bg2 }}
                    />
                    <Pressable
                      disabled={!patInput || patLoading}
                      onPress={handleSavePat}
                      style={({ pressed }) => ({ opacity: pressed || !patInput ? 0.6 : 1, backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 8, alignItems: 'center' })}>
                      <Text style={{ color: '#fff', fontWeight: '600' }}>{patLoading ? 'Validating...' : 'Validate & Save'}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </SettingsGroup>
          </>
        )}
      </SettingsScreen>

      <NativeAlert
        visible={alert !== null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
      />

      {deviceFlowState && (
        <Modal visible transparent animationType="slide">
          <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <View
              className="rounded-t-3xl p-6 gap-6 pb-12"
              style={{ backgroundColor: colors.bg }}>
              <Text className="text-sf-text text-xl font-bold text-center">Authenticate Device</Text>
              <Text className="text-sf-text-2 text-base text-center">
                Please enter the following code at GitHub:
              </Text>
              <View className="items-center justify-center p-4 rounded-xl" style={{ backgroundColor: colors.bg2 }}>
                <Text className="text-sf-text text-3xl font-mono font-bold tracking-widest">
                  {deviceFlowState.userCode}
                </Text>
              </View>
              <Pressable
                onPress={() => Linking.openURL(deviceFlowState.url)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 8 })}>
                <Icon name="arrow-up-right" size={20} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600' }}>Open GitHub</Text>
              </Pressable>
              <Text className="text-sf-text-3 text-center text-sm">
                Waiting for authorization...
              </Text>
              <Pressable onPress={() => setDeviceFlowState(null)} className="py-2">
                <Text className="text-sf-blue text-center text-base font-medium">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
