import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    getAccounts().then((next) => {
      setAccounts(next);
      setAccountId((current) => current ?? next[0]?.id ?? null);
    }).catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Could not load accounts.'));
  }, []);

  const canCreate = title.trim().length > 0 && accountId != null && !createBoard.isPending;

  async function submit() {
    if (!canCreate) return;
    try {
      const board = await createBoard.mutateAsync({ title: title.trim(), account_id: accountId ?? undefined });
      setSelectedBoardId(board.id);
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Please try again.');
    }
  }

  return (
    <SheetSurface>
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive">
        <Stack.Screen options={{ title: 'New Board' }} />
        <View className="gap-2 px-4 pt-4">
          <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Board name</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={submit}
            placeholder="e.g. Personal"
            placeholderTextColor={colors.text2}
            autoFocus
            returnKeyType="done"
            className="text-sf-text bg-sf-bg-2 rounded-xl px-3 py-3 text-base"
            style={{ borderCurve: 'continuous' }}
          />
          <Text className="text-sf-text-3 px-1 text-xs">
            New boards start with To do, Doing and Done columns.
          </Text>
        </View>

        {accounts.length > 1 ? (
          <View className="gap-2 px-4 pt-5">
            <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Account</Text>
            <View className="flex-row flex-wrap gap-2">
              {accounts.map((account) => {
                const selected = account.id === accountId;
                return (
                  <Pressable
                    key={account.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setAccountId(account.id)}>
                    <View className={`rounded-full px-3 py-1.5 ${selected ? 'bg-sf-blue' : 'bg-sf-bg-2'}`}>
                      <Text className={selected ? 'text-sf-on-accent' : 'text-sf-text-2'}>
                        {account.displayName}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View className="px-4 pt-6">
          <Pressable
            onPress={submit}
            disabled={!canCreate}
            style={({ pressed }) => ({ opacity: !canCreate ? 0.4 : pressed ? 0.8 : 1 })}>
            <View
              className="bg-sf-blue items-center rounded-xl py-3.5"
              style={{ borderCurve: 'continuous' }}>
              <Text className="text-sf-on-accent text-base font-semibold">
                {createBoard.isPending ? 'Creating…' : 'Create Board'}
              </Text>
            </View>
          </Pressable>
        </View>

        <NativeAlert
          visible={errorMessage != null}
          title="Could not create board"
          message={errorMessage ?? ''}
          onDismiss={() => setErrorMessage(null)}
        />
      </ScrollView>
    </SheetSurface>
  );
}
