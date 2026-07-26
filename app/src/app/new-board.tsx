import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { useCreateDeckBoard } from '@/hooks/use-deck';
import { getAccounts, type CalDavAccount } from '@/lib/credentials';
import { useUiStore } from '@/stores/ui-store';
import { ScrollView, Text, TextInput, View } from '@/tw';


export default function NewBoardScreen() {
  const { colors } = useTheme();
  const createBoard = useCreateDeckBoard();
  const setSelectedBoardId = useUiStore((s) => s.setSelectedBoardId);
  const [title, setTitle] = useState('');
  const [accounts, setAccounts] = useState<CalDavAccount[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getAccounts()
      .then((next) => {
        setAccounts(next);
        setAccountId((current) => current ?? next[0]?.id ?? null);
      })
      .catch((error) =>
        setErrorMessage(error instanceof Error ? error.message : 'Could not load accounts.')
      )
      .finally(() => setLoadingAccounts(false));
  }, []);

  const canCreate = title.trim().length > 0 && accountId != null && !createBoard.isPending;

  async function submit() {
    if (!canCreate) return;
    try {
      const board = await createBoard.mutateAsync({
        title: title.trim(),
        account_id: accountId ?? undefined,
      });
      setSelectedBoardId(board.id);
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    // Only the scrolling form needs the full sheet; the loading state rests at
    // the partial detent so the sheet doesn't fill the screen for a spinner.
    <SheetSurface
      title="New board"
      subtitle="Starts with To do, Doing and Done"
      skipPartiallyExpanded={!loadingAccounts}>
      <Stack.Screen options={{ title: 'New Board' }} />
      {loadingAccounts ? (
        <View style={{ minHeight: 220, justifyContent: 'center' }}>
          <LoadingState
            message="Loading accounts…"
            subtitle="Preparing your CalDAV accounts"
            fullScreen={false}
            showBar
          />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          style={{ backgroundColor: 'transparent' }}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 32 }}>
          <View className="gap-2 px-5 pt-4">
            <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Board name</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={submit}
              placeholder="e.g. Personal"
              placeholderTextColor={colors.text2}
              autoFocus
              returnKeyType="done"
              className="text-sf-text rounded-2xl px-4 py-3.5 text-base"
              style={{
                backgroundColor: colors.bg3,
                borderCurve: 'continuous',
                minHeight: 52,
              }}
            />
          </View>

          {accounts.length > 1 ? (
            <View className="gap-2 px-5 pt-5">
              <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Account</Text>
              <View className="flex-row flex-wrap gap-2">
                {accounts.map((account) => {
                  const selected = account.id === accountId;
                  return (
                    <Pressable
                      key={account.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setAccountId(account.id)}
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                      <View
                        className="rounded-full px-4 py-2.5"
                        style={{
                          minHeight: 40,
                          backgroundColor: selected ? colors.primaryContainer : colors.bg3,
                          borderCurve: 'continuous',
                        }}>
                        <Text
                          className="text-sm font-medium"
                          style={{
                            color: selected ? colors.onPrimaryContainer : colors.text2,
                          }}>
                          {account.displayName}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View className="px-5 pt-8">
            <Button
              label={createBoard.isPending ? 'Creating…' : 'Create board'}
              disabled={!canCreate}
              loading={createBoard.isPending}
              onPress={submit}
            />
          </View>

          <NativeAlert
            visible={errorMessage != null}
            title="Could not create board"
            message={errorMessage ?? ''}
            onDismiss={() => setErrorMessage(null)}
          />
        </ScrollView>
      )}
    </SheetSurface>
  );
}
