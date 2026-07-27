import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import {
  CreateGitHubIssueForm,
  type CreateGitHubIssueValues,
} from '@/components/github/create-github-issue-form';
import {
  CreateDestinationControl,
  type CreateDestination,
} from '@/components/tasks/create-destination-control';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import {
  selectionFromRepo,
  useCreateGitHubIssue,
  useGitHubRepos,
} from '@/hooks/use-github';
import { useGitHubSessionStore } from '@/stores/github-session-store';
import { setCreateHandoff, takeCreateHandoff } from '@/stores/create-handoff';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, View } from '@/tw';

const ADJUSTS_KEYBOARD_INSETS = process.env.EXPO_OS === 'ios';

export default function NewGitHubIssueScreen() {
  const connection = useGitHubSessionStore((state) => state.state);
  const selections = useSettingsStore((state) => state.githubRepositories);
  const issueScope = useSettingsStore((state) => state.githubIssueScope);
  const repositoriesQuery = useGitHubRepos();
  const createIssue = useCreateGitHubIssue();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Claimed once, on first render, from a Task <-> GitHub issue switch.
  const [handoff] = useState(takeCreateHandoff);
  const draftRef = useRef({ title: handoff?.title ?? '', body: handoff?.body ?? '' });

  // iOS gets exact insets from the ScrollView's own frame, which matters
  // inside a form sheet: the raw keyboard height is measured against the whole
  // screen and over-pads a sheet that only covers part of it.
  useEffect(() => {
    if (ADJUSTS_KEYBOARD_INSETS) return;
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const repositories = useMemo(() => {
    const selectedNames = new Set(
      selections.map((repository) => repository.fullName.toLowerCase())
    );
    return (repositoriesQuery.data?.repositories ?? []).filter(
      (repository) =>
        selectedNames.has(repository.full_name.toLowerCase()) &&
        repository.canCreateIssues &&
        repository.has_issues &&
        !repository.archived
    );
  }, [repositoriesQuery.data?.repositories, selections]);

  function changeDestination(destination: CreateDestination) {
    if (destination === 'task') {
      Keyboard.dismiss();
      // Carry shared text plus any task-only fields that arrived with us, so
      // switching Task -> GitHub issue -> Task is lossless.
      setCreateHandoff({ ...draftRef.current, task: handoff?.task });
      router.replace('/new-task');
    }
  }

  async function handleSubmit(values: CreateGitHubIssueValues) {
    try {
      const created = await createIssue.mutateAsync({
        repository: selectionFromRepo(values.repository),
        issue: values.issue,
      });
      // The detail screen lives in the tabs stack and has never been on this
      // one, so there is nothing for `dismissTo` to pop back to. Close the
      // sheet first, then push the destination.
      router.back();
      router.push({
        pathname: '/github-issue/[id]',
        params: {
          id: String(created.id),
          repo: created.repo,
          number: String(created.number),
        },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not create the GitHub issue.'
      );
    }
  }

  if (
    connection.status === 'initializing' ||
    connection.status === 'refreshing'
  ) {
    return (
      <SheetSurface title="New GitHub issue" subtitle="Checking your account">
        <View style={{ flex: 1 }}>
          <CreateDestinationControl
            value="github-issue"
            onChange={changeDestination}
          />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <LoadingState
              message="Checking GitHub…"
              subtitle="Reading the connection from this device"
              fullScreen={false}
              showBar
            />
          </View>
        </View>
      </SheetSurface>
    );
  }

  if (connection.status !== 'connected') {
    const needsReconnect = connection.status === 'expired';
    const connectionMessage =
      connection.status === 'expired' || connection.status === 'error'
        ? connection.message
        : undefined;
    return (
      <SheetSurface title="New GitHub issue" subtitle="Connect an account first">
        <View style={{ flex: 1 }}>
          <CreateDestinationControl
            value="github-issue"
            onChange={changeDestination}
          />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              icon="github"
              title={needsReconnect ? 'Reconnect GitHub' : 'Connect GitHub'}
              subtitle={
                needsReconnect
                  ? connectionMessage
                  : connectionMessage ??
                    'A connected GitHub account with Issues write access is required.'
              }
              actions={[
                {
                  label: needsReconnect ? 'Reconnect' : 'Open GitHub settings',
                  onPress: () => router.push('/settings/github'),
                  variant: 'filled',
                },
              ]}
            />
          </View>
        </View>
      </SheetSurface>
    );
  }

  if (repositoriesQuery.isLoading && repositories.length === 0) {
    return (
      <SheetSurface title="New GitHub issue" subtitle="Choose where it belongs">
        <View style={{ flex: 1 }}>
          <CreateDestinationControl
            value="github-issue"
            onChange={changeDestination}
          />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <LoadingState
              message="Loading repositories…"
              subtitle="Checking issue permissions"
              fullScreen={false}
              showBar
            />
          </View>
        </View>
      </SheetSurface>
    );
  }

  if (repositories.length === 0) {
    return (
      <SheetSurface title="New GitHub issue" subtitle="Choose where it belongs">
        <View style={{ flex: 1 }}>
          <CreateDestinationControl
            value="github-issue"
            onChange={changeDestination}
          />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <EmptyState
              icon={
                repositoriesQuery.isError
                  ? 'github'
                  : 'source-repository-multiple'
              }
              title={
                repositoriesQuery.isError
                  ? 'Could not load repositories'
                  : 'No repositories available'
              }
              subtitle={
                repositoriesQuery.isError
                  ? 'Check the GitHub connection and try again.'
                  : 'Select an active repository where this account can create issues.'
              }
              actions={[
                ...(repositoriesQuery.isError
                  ? [
                      {
                        label: 'Retry',
                        onPress: () => repositoriesQuery.refetch(),
                        variant: 'filled' as const,
                      },
                    ]
                  : []),
                {
                  label: 'Manage repositories',
                  onPress: () => router.push('/settings/github-repositories'),
                  variant: repositoriesQuery.isError
                    ? ('tonal' as const)
                    : ('filled' as const),
                },
              ]}
            />
          </View>
        </View>
      </SheetSurface>
    );
  }

  return (
    <SheetSurface title="New GitHub issue" subtitle="Capture work without leaving Patchwork">
      <CreateDestinationControl
        value="github-issue"
        onChange={changeDestination}
      />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={ADJUSTS_KEYBOARD_INSETS}
        contentContainerStyle={{ paddingBottom: keyboardHeight + 28 }}>
        <CreateGitHubIssueForm
          repositories={repositories}
          initialTitle={handoff?.title ?? ''}
          initialBody={handoff?.body ?? ''}
          onDraftChange={(draft) => {
            draftRef.current = draft;
          }}
          viewerLogin={connection.credentials.account.login}
          defaultAssignToViewer={issueScope === 'assigned'}
          submitting={createIssue.isPending}
          onSubmit={handleSubmit}
        />
      </ScrollView>
      <NativeAlert
        visible={errorMessage != null}
        title="Could not create issue"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </SheetSurface>
  );
}
