import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, TextInput } from 'react-native';
import Animated, { FadeIn, LinearTransition, ZoomIn } from 'react-native-reanimated';

import type { TaskList } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { useCreateTaskList } from '@/features/tasks/mutations';
import { LOCAL_ACCOUNT_ID, LOCAL_ACCOUNT_NAME } from '@/features/tasks/local-tasks';
import { haptics } from '@/lib/haptics';
import { sheetOverlayStyle } from '@/components/ui/sheet-panel';
import { DURATION, SPRING } from '@/lib/motion';
import { ScrollView, Text, View } from '@/tw';

/** Android uses M3 surface roles; iOS keeps its grays and shadow. */
const ANDROID = Platform.OS === 'android';

/**
 * Popover-style list chooser used by Move and by the add dialog. Pass `repos`
 * to offer GitHub repositories as destinations too (the add dialog does).
 * "New list" at the bottom makes a list and picks it, so a missing list never
 * means leaving the flow.
 */
export function ListPicker({
  visible,
  lists,
  selectedId,
  title = 'Move to',
  onSelect,
  onClose,
  repos,
  selectedRepo,
  onSelectRepo,
}: {
  visible: boolean;
  lists: TaskList[];
  selectedId: string | null;
  title?: string;
  onSelect: (list: TaskList) => void;
  onClose: () => void;
  repos?: { fullName: string }[];
  selectedRepo?: string | null;
  onSelectRepo?: (fullName: string) => void;
}) {
  const { colors } = useTheme();
  const accounts = [...new Set(lists.map((l) => l.account_name).filter(Boolean))];
  const grouped = accounts.length > 1;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(DURATION.short4)} style={sheetOverlayStyle()}>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }}>
          <Animated.View
            entering={ZoomIn.springify().damping(SPRING.spatial.damping).stiffness(SPRING.spatial.stiffness)}
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: ANDROID ? colors.surfaceContainerHigh : colors.bg3,
              borderRadius: 28,
              borderCurve: 'continuous',
              maxHeight: '70%',
              paddingVertical: 12,
              boxShadow: ANDROID ? undefined : '0 12px 32px rgba(0,0,0,0.3)',
            }}>
            <Text
              className="text-sf-text px-6 pb-2 pt-2"
              style={{ fontSize: 20, fontWeight: '700' }}>
              {title}
            </Text>
            <ScrollView style={{ flexGrow: 0 }}>
              {(grouped ? accounts : [undefined]).map((account) => (
                <View key={account ?? 'all'}>
                  {grouped ? (
                    <Text className="text-sf-text-2 px-6 pb-1 pt-3 text-xs font-semibold">
                      {account}
                    </Text>
                  ) : null}
                  {lists
                    .filter((l) => !grouped || l.account_name === account)
                    .map((list) => {
                      const selected = !selectedRepo && list.id === selectedId;
                      return (
                        <Pressable
                          key={list.id}
                          onPress={() => {
                            haptics.selection();
                            onSelect(list);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          android_ripple={{ color: colors.separator }}
                          style={{ minHeight: 52, paddingHorizontal: 24, justifyContent: 'center' }}>
                          <View className="flex-row items-center gap-4">
                            <MaterialCommunityIcons
                              name={selected ? 'circle-slice-8' : 'circle-outline'}
                              size={22}
                              color={selected ? colors.accent : colors.gray}
                            />
                            <Text className="text-sf-text flex-1" style={{ fontSize: 17 }}>
                              {list.name}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                </View>
              ))}
              <NewListRow lists={lists} selectedId={selectedId} onCreated={onSelect} />
              {repos && repos.length > 0 && onSelectRepo ? (
                <View>
                  <Text
                    className="px-6 pb-1 pt-3"
                    style={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>
                    GitHub issue in
                  </Text>
                  {repos.map((repo) => {
                    const selected = repo.fullName === selectedRepo;
                    return (
                      <Pressable
                        key={repo.fullName}
                        onPress={() => {
                          haptics.selection();
                          onSelectRepo(repo.fullName);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        android_ripple={{ color: colors.separator }}
                        style={{ minHeight: 52, paddingHorizontal: 24, justifyContent: 'center' }}>
                        <View className="flex-row items-center gap-4">
                          <MaterialCommunityIcons
                            name={selected ? 'circle-slice-8' : 'github'}
                            size={22}
                            color={selected ? colors.accent : colors.gray}
                          />
                          <View className="flex-1">
                            <Text className="text-sf-text" style={{ fontSize: 17 }}>
                              {repo.fullName.split('/')[1] ?? repo.fullName}
                            </Text>
                            <Text style={{ fontSize: 13, color: colors.text2 }}>
                              {repo.fullName.split('/')[0]}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

/**
 * The picker's last row. Tapped, it turns into a name field (with account
 * chips when there is more than one account) and creates the list in place.
 * The Modal unmounts it on close, so each opening starts fresh.
 */
function NewListRow({
  lists,
  selectedId,
  onCreated,
}: {
  lists: TaskList[];
  selectedId: string | null;
  onCreated: (list: TaskList) => void;
}) {
  const { colors } = useTheme();
  const createList = useCreateTaskList();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The web proxy owns its accounts, so it gets no choice.
  const accounts = (() => {
    if (process.env.EXPO_OS === 'web') return [];
    const seen = new Map<string, string>();
    for (const list of lists) {
      if (list.account_id && !seen.has(list.account_id)) seen.set(list.account_id, list.account_name ?? list.account_id);
    }
    if (!seen.has(LOCAL_ACCOUNT_ID)) seen.set(LOCAL_ACCOUNT_ID, LOCAL_ACCOUNT_NAME);
    return [...seen].map(([id, label]) => ({ id, label }));
  })();
  const defaultAccount = lists.find((l) => l.id === selectedId)?.account_id ?? lists[0]?.account_id ?? accounts[0]?.id;
  const accountId = accountChoice ?? defaultAccount;
  const busy = createList.isPending;
  const canCreate = name.trim().length > 0 && !busy;

  async function submit() {
    if (!canCreate) return;
    setError(null);
    try {
      const list = await createList.mutateAsync({ name: name.trim(), account_id: accountId });
      haptics.success();
      onCreated(list);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Could not create the list.');
    }
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => {
          haptics.tap();
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="New list"
        android_ripple={{ color: colors.separator }}
        style={{ minHeight: 52, paddingHorizontal: 24, justifyContent: 'center' }}>
        <View className="flex-row items-center gap-4">
          <MaterialCommunityIcons name="plus" size={22} color={colors.accent} />
          <Text style={{ fontSize: 17, color: colors.accent, fontWeight: '500' }}>New list</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Animated.View
      entering={FadeIn.duration(DURATION.short4)}
      layout={LinearTransition.duration(DURATION.short4)}
      style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4, gap: 10 }}>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        editable={!busy}
        placeholder="List name"
        placeholderTextColor={colors.text3}
        accessibilityLabel="New list name"
        returnKeyType="done"
        onSubmitEditing={submit}
        style={{
          fontSize: 17,
          color: colors.text,
          backgroundColor: ANDROID ? colors.surfaceContainerHighest : colors.bg2,
          borderRadius: 14,
          borderCurve: 'continuous',
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      />
      {accounts.length > 1 ? (
        <View className="flex-row flex-wrap" style={{ gap: 8 }} accessibilityRole="radiogroup">
          {accounts.map((account) => {
            const on = account.id === accountId;
            return (
              <Pressable
                key={account.id}
                onPress={() => {
                  haptics.selection();
                  setAccountChoice(account.id);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{
                  height: 32,
                  paddingHorizontal: 12,
                  borderRadius: on ? 8 : 16,
                  justifyContent: 'center',
                  backgroundColor: on ? colors.selectionBg : 'transparent',
                  borderWidth: on ? 0 : 1,
                  borderColor: colors.separator,
                }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: on ? colors.onSelectionBg : colors.text2 }}>
                  {account.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
      <View className="flex-row justify-end" style={{ gap: 8 }}>
        <Pressable
          onPress={() => {
            haptics.tap();
            setOpen(false);
            setName('');
            setError(null);
          }}
          disabled={busy}
          accessibilityRole="button"
          style={{ height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.accent }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={!canCreate}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate, busy }}
          style={({ pressed }) => ({
            height: 40,
            paddingHorizontal: 18,
            borderRadius: pressed ? 12 : 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: colors.accent,
            opacity: canCreate || busy ? 1 : 0.45,
          })}>
          {busy ? <ActivityIndicator size="small" color={colors.onAccent} /> : null}
          <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onAccent }}>Create</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
