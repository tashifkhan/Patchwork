import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable } from 'react-native';

import { RowSeparator, SettingsGroup, SettingsRow, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { useGitHubConnection } from '@/hooks/use-github-connection';
import { selectionFromRepo, useValidatePublicGitHubRepo } from '@/hooks/use-github';
import { normalizeGitHubRepository } from '@/features/github/repository-ref';
import type { GitHubIssueScope, GitHubIssueState } from '@/features/github/types';
import { queryKeys } from '@/lib/query-client';
import { isOAuthAvailable } from '@/lib/github-auth';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, TextInput, View } from '@/tw';

const SCOPE_OPTIONS: { id: GitHubIssueScope; label: string; hint: string }[] = [
  { id: 'assigned', label: 'Assigned to me', hint: 'Issues where you are an assignee' },
  { id: 'created', label: 'Created by me', hint: 'Issues you opened' },
  { id: 'mentioned', label: 'Mentioned', hint: 'Issues that mention you' },
  { id: 'all', label: 'All issues', hint: 'Every issue in selected repositories' },
];

const STATE_OPTIONS: { id: GitHubIssueState; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
];

export default function GitHubSettingsScreen() {
  const { colors, scheme } = useTheme();
  const queryClient = useQueryClient();
  const connection = useGitHubConnection();
  const repositories = useSettingsStore((state) => state.githubRepositories);
  const setRepositories = useSettingsStore((state) => state.setGitHubRepositories);
  const issueScope = useSettingsStore((state) => state.githubIssueScope);
  const issueState = useSettingsStore((state) => state.githubIssueState);
  const setIssueScope = useSettingsStore((state) => state.setGitHubIssueScope);
  const setIssueState = useSettingsStore((state) => state.setGitHubIssueState);
  const validatePublicRepo = useValidatePublicGitHubRepo();

  const [publicRepoInput, setPublicRepoInput] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [patInput, setPatInput] = useState('');
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const account =
    connection.connection.status === 'connected' ||
    connection.connection.status === 'refreshing'
      ? connection.connection.credentials.account
      : connection.connection.status === 'expired'
        ? connection.connection.account
        : undefined;
  const isConnected = connection.connection.status === 'connected';

  const addPublicRepository = async () => {
    try {
      const fullName = normalizeGitHubRepository(publicRepoInput);
      if (
        repositories.some(
          (repository) => repository.fullName.toLowerCase() === fullName.toLowerCase()
        )
      ) {
        setPublicRepoInput('');
        return;
      }
      const repo = await validatePublicRepo.mutateAsync({ fullName });
      setRepositories([...repositories, selectionFromRepo(repo)]);
      setPublicRepoInput('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.githubRepos }),
        queryClient.invalidateQueries({ queryKey: queryKeys.githubIssues }),
      ]);
    } catch (error) {
      setAlert({
        title: 'Could not add repository',
        message: error instanceof Error ? error.message : 'Please check the repository name.',
      });
    }
  };

  const savePat = async () => {
    try {
      await connection.connectPat(patInput);
      setPatInput('');
      setShowPat(false);
    } catch {
      // The connection hook exposes the actionable message through connectionError.
    }
  };

  if (connection.connection.status === 'initializing') {
    return <LoadingState message="Checking GitHub…" subtitle="Reading the connection from this device" />;
  }

  return (
    <>
      <SettingsScreen>
        <ConnectionSummary
          account={account}
          status={connection.connection.status}
          authKind={
            isConnected ? connection.connection.credentials.authKind : undefined
          }
          message={
            connection.connection.status === 'expired' ||
            connection.connection.status === 'error'
              ? connection.connection.message
              : undefined
          }
        />

        {!isConnected ? (
          <SettingsGroup title="Connect">
            <View className="gap-4 px-4 py-4">
              <Text selectable className="text-sf-text-2 text-sm">
                Connect a GitHub App to access repositories and close or reopen issues.
                Credentials stay encrypted on this device.
              </Text>
              {isOAuthAvailable() ? (
                <Button
                  label={
                    connection.deviceFlow ? 'Waiting for GitHub…' : 'Connect GitHub'
                  }
                  icon="github"
                  disabled={!!connection.deviceFlow}
                  onPress={connection.beginDeviceFlow}
                />
              ) : (
                <View
                  className="gap-2 rounded-xl p-4"
                  style={{ backgroundColor: `${colors.danger}18`, borderCurve: 'continuous' }}>
                  <Text selectable style={{ color: colors.danger, fontWeight: '600' }}>
                    GitHub App not configured
                  </Text>
                  <Text selectable className="text-sf-text-2 text-sm">
                    Add EXPO_PUBLIC_GITHUB_CLIENT_ID to the native build, or use a
                    fine-grained token below.
                  </Text>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowPat((visible) => !visible)}
                style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1, minHeight: 44, justifyContent: 'center' })}>
                <Text className="text-sf-blue text-center text-sm font-semibold">
                  {showPat ? 'Hide advanced token setup' : 'Advanced: use a fine-grained token'}
                </Text>
              </Pressable>
              {showPat ? (
                <View className="gap-3">
                  <Text selectable className="text-sf-text-2 text-sm">
                    Use a fine-grained token limited to the repositories you want, with
                    Issues read and write permission.
                  </Text>
                  <TextInput
                    value={patInput}
                    onChangeText={setPatInput}
                    placeholder="github_pat_…"
                    placeholderTextColor={colors.gray}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    className="text-sf-text rounded-xl px-4 py-3.5 text-base"
                    style={{ backgroundColor: colors.bg3, minHeight: 48 }}
                  />
                  <Button
                    variant="tonal"
                    label={connection.patPending ? 'Validating…' : 'Validate and save'}
                    loading={connection.patPending}
                    disabled={!patInput.trim() || connection.patPending}
                    onPress={savePat}
                  />
                </View>
              ) : null}
            </View>
          </SettingsGroup>
        ) : null}

        <SettingsGroup title={`Repositories · ${repositories.length}`}>
          <SettingsRow
            icon="source-repository-multiple"
            title="Manage repositories"
            subtitle={
              isConnected
                ? 'Choose from repositories accessible to this GitHub account'
                : 'Manage public repositories available without signing in'
            }
            showChevron
            onPress={() => router.push('/settings/github-repositories')}
          />
          {!isConnected ? (
            <>
              <RowSeparator />
              <View className="gap-3 px-4 py-4">
                <Text selectable className="text-sf-text-2 text-sm">
                  Public repositories work without an account and remain read-only.
                </Text>
                <TextInput
                  value={publicRepoInput}
                  onChangeText={setPublicRepoInput}
                  placeholder="owner/repository or GitHub URL"
                  placeholderTextColor={colors.gray}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="text-sf-text rounded-xl px-4 py-3.5 text-base"
                  style={{ backgroundColor: colors.bg3, minHeight: 48 }}
                  onSubmitEditing={addPublicRepository}
                />
                <Button
                  variant="tonal"
                  label={validatePublicRepo.isPending ? 'Checking…' : 'Add public repository'}
                  loading={validatePublicRepo.isPending}
                  disabled={!publicRepoInput.trim() || validatePublicRepo.isPending}
                  onPress={addPublicRepository}
                />
              </View>
            </>
          ) : null}
        </SettingsGroup>

        {repositories.length > 0 ? (
          <>
            {isConnected ? (
              <SettingsGroup title="Issue scope">
                {SCOPE_OPTIONS.map((option, index) => (
                  <View key={option.id}>
                    {index > 0 ? <RowSeparator /> : null}
                    <SettingsRow
                      icon={
                        option.id === 'assigned'
                          ? 'account-check-outline'
                          : option.id === 'created'
                            ? 'pencil-outline'
                            : option.id === 'mentioned'
                              ? 'at'
                              : 'format-list-bulleted'
                      }
                      title={option.label}
                      subtitle={option.hint}
                      selected={issueScope === option.id}
                      onPress={() => {
                        setIssueScope(option.id);
                        queryClient.invalidateQueries({ queryKey: queryKeys.githubIssues });
                      }}
                      trailing={
                        issueScope === option.id ? (
                          <MaterialCommunityIcons name="check" size={20} color={colors.accent} />
                        ) : null
                      }
                    />
                  </View>
                ))}
              </SettingsGroup>
            ) : null}

            <SettingsGroup title="Issue state">
              <View className="px-4 py-4">
                <SegmentedControl
                  appearance={scheme}
                  values={STATE_OPTIONS.map((option) => option.label)}
                  selectedIndex={Math.max(
                    0,
                    STATE_OPTIONS.findIndex((option) => option.id === issueState)
                  )}
                  tintColor={colors.accent}
                  onChange={(event) => {
                    const next =
                      STATE_OPTIONS[event.nativeEvent.selectedSegmentIndex]?.id ?? 'all';
                    setIssueState(next);
                    queryClient.invalidateQueries({ queryKey: queryKeys.githubIssues });
                  }}
                />
              </View>
            </SettingsGroup>
          </>
        ) : null}

        {isConnected || connection.connection.status === 'expired' ? (
          <SettingsGroup>
            {connection.connection.status === 'expired' ? (
              <SettingsRow
                icon="refresh"
                title="Reconnect GitHub"
                subtitle="Authorization expired or was revoked"
                onPress={connection.beginDeviceFlow}
              />
            ) : null}
            {connection.connection.status === 'expired' ? <RowSeparator /> : null}
            <SettingsRow
              icon="logout"
              title="Disconnect account"
              subtitle="Repository selections are kept on this device"
              danger
              onPress={() => setConfirmDisconnect(true)}
            />
          </SettingsGroup>
        ) : null}
      </SettingsScreen>

      <DeviceFlowSheet
        flow={connection.deviceFlow}
        onCancel={connection.cancelDeviceFlow}
      />

      <NativeAlert
        visible={alert !== null || connection.connectionError !== null}
        title={alert?.title ?? 'GitHub connection'}
        message={alert?.message ?? connection.connectionError ?? ''}
        onDismiss={() => {
          setAlert(null);
          connection.clearConnectionError();
        }}
      />
      <NativeAlert
        visible={confirmDisconnect}
        title="Disconnect GitHub?"
        message="The token will be removed from this device. Your repository selections will be kept."
        confirmLabel="Disconnect"
        dismissLabel="Cancel"
        onDismiss={() => setConfirmDisconnect(false)}
        onConfirm={() => {
          setConfirmDisconnect(false);
          connection.disconnect().catch((error) =>
            setAlert({
              title: 'Could not disconnect',
              message: error instanceof Error ? error.message : 'Please try again.',
            })
          );
        }}
      />
    </>
  );
}

function ConnectionSummary({
  account,
  status,
  authKind,
  message,
}: {
  account?: { login: string; avatarUrl: string };
  status: string;
  authKind?: string;
  message?: string;
}) {
  const { colors } = useTheme();
  const connected = status === 'connected';
  const title = account ? `@${account.login}` : 'GitHub Issues';
  const subtitle = connected
    ? authKind === 'fine-grained-pat'
      ? 'Connected with a fine-grained token'
      : authKind === 'legacy-oauth'
        ? 'Legacy connection · reconnect recommended'
        : 'Connected with GitHub App'
    : status === 'expired'
      ? 'Connection needs attention'
      : status === 'error'
        ? 'GitHub could not be checked'
        : 'Not connected';

  return (
    <SettingsGroup>
      <View className="items-center gap-3 px-5 py-6">
        {account?.avatarUrl ? (
          <Image
            source={{ uri: account.avatarUrl }}
            style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: colors.bg2 }}
            contentFit="cover"
          />
        ) : (
          <View
            className="h-20 w-20 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.bg2 }}>
            <MaterialCommunityIcons name="github" size={40} color={colors.text2} />
          </View>
        )}
        <View className="items-center gap-1">
          <Text selectable className="text-sf-text text-lg font-semibold">{title}</Text>
          <Text selectable className="text-sf-text-2 text-center text-sm">{subtitle}</Text>
          {message ? (
            <Text selectable style={{ color: colors.danger, textAlign: 'center', fontSize: 13 }}>
              {message}
            </Text>
          ) : null}
        </View>
      </View>
    </SettingsGroup>
  );
}

function DeviceFlowSheet({
  flow,
  onCancel,
}: {
  flow: { userCode: string; verificationUrl: string; expiresAt: number } | null;
  onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!flow) return;
    const update = () => setNow(Date.now());
    const kickoff = setTimeout(update, 0);
    const timer = setInterval(update, 1000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [flow]);

  const remaining = useMemo(
    () => (flow ? Math.max(0, Math.ceil((flow.expiresAt - now) / 1000)) : 0),
    [flow, now]
  );

  return (
    <Modal visible={!!flow} transparent animationType="slide" onRequestClose={onCancel}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View
          className="gap-5 rounded-t-3xl px-6 pb-12 pt-6"
          style={{ backgroundColor: colors.bg, borderCurve: 'continuous' }}>
          <Text className="text-sf-text text-center text-xl font-bold">Authorize Patchwork</Text>
          <Text selectable className="text-sf-text-2 text-center text-sm">
            Enter this one-time code on GitHub. Patchwork will continue automatically.
          </Text>
          <View className="items-center rounded-2xl p-5" style={{ backgroundColor: colors.bg2 }}>
            <Text selectable className="text-sf-text font-mono text-3xl font-bold tracking-widest">
              {flow?.userCode ?? ''}
            </Text>
          </View>
          <Button
            label="Open GitHub"
            icon="open-in-new"
            onPress={() => flow && Linking.openURL(flow.verificationUrl)}
          />
          <Text
            selectable
            className="text-sf-text-3 text-center text-sm"
            style={{ fontVariant: ['tabular-nums'] }}>
            Waiting for authorization · {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, '0')}
          </Text>
          <Button variant="text" label="Cancel" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}
