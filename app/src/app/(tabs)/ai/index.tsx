import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Host, TextInput as ExpoTextInput, type TextInputRef } from '@expo/ui';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, useWindowDimensions, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedKeyboard, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { draftTasks, ocrUploadImage, refineTasks } from '@/api/ai';
import { ApiError } from '@/api/client';
import type { AiGeneratedTask } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import { useHealth } from '@/hooks/use-health';
import { useTaskLists } from '@/hooks/use-tasks';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, Text, View } from '@/tw';

interface Attachment {
  uri: string;
  mimeType: string;
  fileName?: string;
}

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  attachments?: Attachment[];
  tasks?: AiGeneratedTask[];
  error?: string;
  status?: 'pending' | 'done';
}

const SPARKLE_ICON = 'auto-fix' as const;

function newTurnId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AiChatScreen() {
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const healthQuery = useHealth();
  const listsQuery = useTaskLists();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);

  const setStaged = useAiStagingStore((s) => s.setStaged);
  const staged = useAiStagingStore((s) => s.staged);
  const clearStaged = useAiStagingStore((s) => s.clear);
  const aiModelSelections = useSettingsStore((s) => s.aiModelSelections);

  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const scrollRef = useRef<FlatList<ChatTurn>>(null);
  const inputRef = useRef<TextInputRef>(null);
  const rootRef = useRef<RNView>(null);
  const keyboard = useAnimatedKeyboard();
  // Distance from this screen's bottom edge to the bottom of the physical
  // window. With NativeTabs on Android the tab bar reserves space below our
  // container, so subtracting this from the keyboard height keeps the composer
  // flush against the keyboard instead of leaving a tab-bar-sized gap.
  const bottomOffset = useSharedValue(0);
  const measureBottom = useCallback(() => {
    rootRef.current?.measureInWindow((_x, y, _w, h) => {
      const offset = windowHeight - (y + h);
      bottomOffset.value = offset > 0 ? offset : 0;
    });
  }, [bottomOffset, windowHeight]);
  const composerStyle = useAnimatedStyle(() => {
    const baseline = Math.max(insets.bottom, 8);
    const kh = keyboard.height.value;
    if (kh <= 0) return { paddingBottom: baseline };
    const lift = Math.max(kh - bottomOffset.value, 0);
    return { paddingBottom: lift + 8 };
  });

  const geminiReady = healthQuery.data?.gemini_configured ?? true;
  const noModelsConfigured = !isWeb && aiModelSelections.length === 0;
  const canSend = !busy && (text.trim().length > 0 || attachments.length > 0);

  useEffect(() => {
    if (turns.length === 0) return;
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [turns]);

  const pickFromLibrary = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAlert({ title: 'Permission needed', message: 'Allow photo library access to attach images.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      allowsMultipleSelection: true,
      selectionLimit: 4,
    });
    if (result.canceled) return;
    const picked: Attachment[] = result.assets.map((asset) => ({
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
      fileName: asset.fileName ?? undefined,
    }));
    setAttachments((prev) => [...prev, ...picked].slice(0, 4));
  }, []);

  const pickFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setAlert({ title: 'Permission needed', message: 'Allow camera access to capture an image.' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setAttachments((prev) =>
      [
        ...prev,
        { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileName: asset.fileName ?? undefined },
      ].slice(0, 4)
    );
  }, []);

  function appendTurn(turn: ChatTurn) {
    setTurns((prev) => [...prev, turn]);
  }

  function patchTurn(id: string, patch: Partial<ChatTurn>) {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }

  function dropTask(turnId: string, taskIndex: number) {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn?.tasks) return;
    const nextTasks = turn.tasks.filter((_, i) => i !== taskIndex);
    patchTurn(turnId, { tasks: nextTasks });
    const currentTurnId = [...turns].reverse().find((candidate) => candidate.tasks)?.id;
    if (turnId === currentTurnId) setStaged(nextTasks);
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function send() {
    if (!canSend) return;
    const userText = text.trim();
    const userAttachments = attachments;
    const userTurnId = newTurnId();
    const assistantTurnId = newTurnId();

    appendTurn({
      id: userTurnId,
      role: 'user',
      text: userText || undefined,
      attachments: userAttachments.length > 0 ? userAttachments : undefined,
    });
    appendTurn({ id: assistantTurnId, role: 'assistant', status: 'pending' });

    setText('');
    setAttachments([]);
    inputRef.current?.clear();
    setBusy(true);

    try {
      let nextTasks: AiGeneratedTask[] = [];

      if (userAttachments.length > 0) {
        for (const attachment of userAttachments) {
          const response = await ocrUploadImage({
            uri: attachment.uri,
            mimeType: attachment.mimeType,
            fileName: attachment.fileName,
            availableLists: lists,
            availableTags: [],
          });
          nextTasks.push(...response.tasks);
        }
        if (userText && nextTasks.length > 0) {
          const refined = await refineTasks({
            instruction: userText,
            tasks: nextTasks,
            available_lists: lists,
            available_tags: [],
          });
          nextTasks = refined.tasks;
        }
      } else if (staged.length > 0) {
        const response = await refineTasks({
          instruction: userText,
          tasks: staged,
          available_lists: lists,
          available_tags: [],
        });
        nextTasks = response.tasks;
      } else {
        const response = await draftTasks({
          instruction: userText,
          available_lists: lists,
          available_tags: [],
        });
        nextTasks = response.tasks;
      }

      setStaged(nextTasks);
      patchTurn(assistantTurnId, { tasks: nextTasks, status: 'done' });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not reach the AI.';
      patchTurn(assistantTurnId, { error: message, status: 'done' });
    } finally {
      setBusy(false);
    }
  }

  function finalize() {
    if (staged.length === 0) return;
    router.push('/ai/review');
  }

  function resetChat() {
    setTurns([]);
    clearStaged();
    setText('');
    setAttachments([]);
    inputRef.current?.clear();
  }

  return (
    <RNView ref={rootRef} onLayout={measureBottom} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          headerRight:
            turns.length > 0
              ? () => (
                  <Pressable onPress={resetChat} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <Text className="text-sf-blue text-base">Clear</Text>
                  </Pressable>
                )
              : undefined,
        }}
      />
      <FlatList
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: colors.bg }}
        data={turns}
        keyExtractor={(turn) => turn.id}
        renderItem={({ item }) => (
          <Bubble turn={item} onRemoveTask={(taskIndex) => dropTask(item.id, taskIndex)} />
        )}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 12 }}
        ListEmptyComponent={
          <EmptyState
            geminiReady={geminiReady}
            noModelsConfigured={noModelsConfigured}
            onCamera={pickFromCamera}
            onLibrary={pickFromLibrary}
          />
        }
      />

      <Animated.View style={[{ backgroundColor: colors.bg }, composerStyle]}>
        {staged.length > 0 ? (
          <View
            className="bg-sf-bg-2 mx-3 mb-2 flex-row items-center gap-3 rounded-2xl px-3 py-2.5"
            style={{ borderCurve: 'continuous' }}>
            <View
              className="bg-sf-blue h-8 w-8 items-center justify-center rounded-full"
              style={{ borderCurve: 'continuous' }}>
              <MaterialCommunityIcons name="check" size={18} color={colors.onAccent} />
            </View>
            <View className="flex-1">
              <Text className="text-sf-text text-sm font-semibold">
                {staged.length} task{staged.length === 1 ? '' : 's'} drafted
              </Text>
              <Text className="text-sf-text-2 text-xs">Keep chatting to refine, or review.</Text>
            </View>
            <Pressable onPress={resetChat} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <MaterialCommunityIcons name="restart" size={20} color={colors.text2} />
            </Pressable>
            <Pressable onPress={finalize} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
              <View className="bg-sf-blue rounded-full px-4 py-2" style={{ borderCurve: 'continuous' }}>
                <Text className="text-sf-on-accent text-xs font-semibold">Review</Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        <Composer
          inputRef={inputRef}
          attachments={attachments}
          busy={busy}
          canSend={canSend}
          onChangeText={setText}
          onRemoveAttachment={removeAttachment}
          onPickLibrary={pickFromLibrary}
          onPickCamera={pickFromCamera}
          onSend={send}
        />
      </Animated.View>

      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
      />
    </RNView>
  );
}

function EmptyState({
  geminiReady,
  noModelsConfigured,
  onCamera,
  onLibrary,
}: {
  geminiReady: boolean;
  noModelsConfigured: boolean;
  onCamera: () => void;
  onLibrary: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="gap-5 py-8">
      <View className="items-center gap-3">
        <View
          className="bg-sf-blue h-14 w-14 items-center justify-center rounded-2xl"
          style={{ borderCurve: 'continuous' }}>
          <MaterialCommunityIcons name={SPARKLE_ICON} size={28} color={colors.onAccent} />
        </View>
        <Text className="text-sf-text text-center text-xl font-semibold">Chat to draft tasks</Text>
        <Text className="text-sf-text-2 px-6 text-center text-sm">
          Describe what you need, paste a list, or attach photos of notes. Each reply gives you draft tasks
          you can keep refining until they look right.
        </Text>
      </View>

      {noModelsConfigured ? (
        <View
          className="bg-sf-bg-2 flex-row items-center gap-2 rounded-xl px-3 py-3"
          style={{ borderCurve: 'continuous' }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.orange} />
          <Text className="text-sf-text-2 flex-1 text-sm">
            No AI model is selected. Open Settings → AI to pick one or more models.
          </Text>
        </View>
      ) : null}

      {!geminiReady && Platform.OS === 'web' ? (
        <View
          className="bg-sf-bg-2 flex-row items-center gap-2 rounded-xl px-3 py-3"
          style={{ borderCurve: 'continuous' }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.orange} />
          <Text className="text-sf-text-2 flex-1 text-sm">
            AI is not configured on the proxy. Requests will fail until LiteLLM or Gemini credentials are set.
          </Text>
        </View>
      ) : null}

      <View className="gap-2">
        <Text className="text-sf-text-2 px-1 text-xs font-semibold uppercase">Try saying</Text>
        {[
          'Plan a Friday launch checklist with reminders.',
          'Make 5 packing tasks for a 3-day trip.',
          'Turn this list into todos: groceries, gym, call mom, finish report.',
        ].map((sample) => (
          <View
            key={sample}
            className="bg-sf-bg-2 rounded-2xl px-3 py-2.5"
            style={{ borderCurve: 'continuous' }}>
            <Text className="text-sf-text-2 text-sm">{sample}</Text>
          </View>
        ))}
      </View>

      {Platform.OS !== 'web' ? (
        <View className="flex-row gap-2">
          <QuickAction icon="camera-outline" label="Take photo" onPress={onCamera} />
          <QuickAction icon="image-multiple-outline" label="From library" onPress={onLibrary} />
        </View>
      ) : null}
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}>
      <View
        className="bg-sf-bg-2 flex-row items-center justify-center gap-2 rounded-2xl py-3"
        style={{ borderCurve: 'continuous' }}>
        <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        <Text className="text-sf-blue text-sm font-semibold">{label}</Text>
      </View>
    </Pressable>
  );
}

function Bubble({ turn, onRemoveTask }: { turn: ChatTurn; onRemoveTask: (taskIndex: number) => void }) {
  const { colors } = useTheme();
  const isUser = turn.role === 'user';

  if (isUser) {
    return (
      <View className="items-end">
        <View
          className="bg-sf-blue max-w-[85%] gap-2 rounded-2xl px-3 py-2.5"
          style={{ borderCurve: 'continuous' }}>
          {turn.attachments && turn.attachments.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {turn.attachments.map((attachment, index) => (
                <Image
                  key={`${attachment.uri}-${index}`}
                  source={{ uri: attachment.uri }}
                  style={{ width: 110, height: 110, borderRadius: 10 }}
                  contentFit="cover"
                />
              ))}
            </View>
          ) : null}
          {turn.text ? (
            <Text className="text-sf-on-accent text-sm" selectable>
              {turn.text}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="items-start gap-2">
      <View
        className="bg-sf-bg-2 w-full gap-2 rounded-2xl px-3 py-2.5"
        style={{ borderCurve: 'continuous' }}>
        {turn.status === 'pending' ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator />
            <Text className="text-sf-text-2 text-sm">Drafting…</Text>
          </View>
        ) : null}

        {turn.error ? (
          <View className="flex-row items-start gap-2">
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={colors.red} />
            <Text className="text-sf-text flex-1 text-sm" selectable>
              {turn.error}
            </Text>
          </View>
        ) : null}

        {turn.tasks && turn.tasks.length > 0 ? (
          <View className="gap-2">
            <Text className="text-sf-text-2 text-xs font-semibold uppercase">
              Drafted {turn.tasks.length} task{turn.tasks.length === 1 ? '' : 's'}
            </Text>
            {turn.tasks.map((task, index) => (
              <InlineTaskCard
                key={`${task.title}-${index}`}
                task={task}
                onRemove={() => onRemoveTask(index)}
              />
            ))}
          </View>
        ) : null}

        {turn.tasks && turn.tasks.length === 0 ? (
          <Text className="text-sf-text-2 text-sm">No tasks were created from that. Try rephrasing.</Text>
        ) : null}
      </View>
    </View>
  );
}

function InlineTaskCard({ task, onRemove }: { task: AiGeneratedTask; onRemove: () => void }) {
  const { colors } = useTheme();
  return (
    <View
      className="bg-sf-bg-3 gap-1 rounded-xl px-3 py-2"
      style={{ borderCurve: 'continuous' }}>
      <View className="flex-row items-start gap-2">
        <View className="mt-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: colors.accent }} />
        <Text className="text-sf-text flex-1 text-sm font-semibold" selectable>
          {task.title}
        </Text>
        <Pressable onPress={onRemove} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <MaterialCommunityIcons name="close-circle" size={18} color={colors.text3} />
        </Pressable>
      </View>
      {task.description ? (
        <Text className="text-sf-text-2 pl-4 text-xs" selectable>
          {task.description}
        </Text>
      ) : null}
      {task.due_at || task.tags.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-1 pl-4 pt-0.5">
          {task.due_at ? (
            <View
              className="bg-sf-bg-2 flex-row items-center gap-1 rounded-full px-2 py-0.5"
              style={{ borderCurve: 'continuous' }}>
              <MaterialCommunityIcons name="calendar" size={10} color={colors.text2} />
              <Text className="text-sf-text-2 text-[10px]">{new Date(task.due_at).toLocaleDateString()}</Text>
            </View>
          ) : null}
          {task.tags.map((tag) => (
            <Text key={tag} className="text-sf-text-3 text-[10px]">
              #{tag}
            </Text>
          ))}
        </View>
      ) : null}
      {task.subtasks.length > 0 ? (
        <Text className="text-sf-text-3 pl-4 text-[10px]">
          + {task.subtasks.length} subtask{task.subtasks.length === 1 ? '' : 's'}
        </Text>
      ) : null}
    </View>
  );
}

function Composer({
  inputRef,
  attachments,
  busy,
  canSend,
  onChangeText,
  onRemoveAttachment,
  onPickLibrary,
  onPickCamera,
  onSend,
}: {
  inputRef: React.RefObject<TextInputRef | null>;
  attachments: Attachment[];
  busy: boolean;
  canSend: boolean;
  onChangeText: (value: string) => void;
  onRemoveAttachment: (index: number) => void;
  onPickLibrary: () => void;
  onPickCamera: () => void;
  onSend: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      className="bg-sf-bg-2 mx-3 gap-2 rounded-3xl p-2"
      style={{ borderCurve: 'continuous', boxShadow: `0 1px 4px ${colors.separator}` }}>
      {attachments.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}>
          {attachments.map((attachment, index) => (
            <View key={`${attachment.uri}-${index}`} style={{ position: 'relative' }}>
              <Image
                source={{ uri: attachment.uri }}
                style={{ width: 56, height: 56, borderRadius: 10 }}
                contentFit="cover"
              />
              <Pressable
                onPress={() => onRemoveAttachment(index)}
                hitSlop={6}
                style={{ position: 'absolute', top: -4, right: -4, backgroundColor: colors.bg, borderRadius: 10 }}>
                <MaterialCommunityIcons name="close-circle" size={18} color={colors.text2} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View className="flex-row items-end gap-1">
        {Platform.OS !== 'web' ? (
          <>
            <Pressable
              onPress={onPickCamera}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 8 })}>
              <MaterialCommunityIcons name="camera-outline" size={22} color={colors.text2} />
            </Pressable>
            <Pressable
              onPress={onPickLibrary}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 8 })}>
              <MaterialCommunityIcons name="image-multiple-outline" size={22} color={colors.text2} />
            </Pressable>
          </>
        ) : null}

        <View style={{ flex: 1, minHeight: 36, justifyContent: 'center' }}>
          <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
            <ExpoTextInput
              ref={inputRef}
              placeholder={attachments.length > 0 ? 'Add a note (optional)' : 'Describe your tasks…'}
              placeholderTextColor={colors.text3}
              multiline
              autoCapitalize="sentences"
              underlineColorAndroid="transparent"
              cursorColor={colors.accent}
              selectionColor={colors.accent}
              onChangeText={onChangeText}
              textStyle={{ color: colors.text, fontSize: 16 }}
              style={{ paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'transparent' }}
            />
          </Host>
        </View>

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: !canSend ? 0.4 : pressed ? 0.7 : 1, padding: 4 })}>
          <View
            className="bg-sf-blue h-9 w-9 items-center justify-center rounded-full"
            style={{ borderCurve: 'continuous' }}>
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <MaterialCommunityIcons name="arrow-up" size={20} color={colors.onAccent} />
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}
