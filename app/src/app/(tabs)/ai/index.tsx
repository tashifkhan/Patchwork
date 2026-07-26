import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  type TextInput as RNTextInput,
  View as RNView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { draftTasks, ocrUploadImage, refineTasks } from '@/api/ai';
import { ApiError } from '@/api/client';
import type { AiGeneratedTask } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { GlassSurface, useLiquidGlass } from '@/components/ui/glass-surface';
import { LoadingSpinner } from '@/components/ui/loading';
import { NativeAlert } from '@/components/ui/native-alert';
import { TouchableRow } from '@/components/ui/touchable-row';
import { useHealth } from '@/hooks/use-health';
import { useTaskLists } from '@/hooks/use-tasks';
import { haptics } from '@/lib/haptics';
import {
  FLOATING_TAB_BAR_HEIGHT,
  FLOATING_TAB_BAR_MARGIN,
  useFloatingTabBar,
  useTabBarMinimizeOnScroll,
} from '@/lib/tab-bar';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, Text, TextInput, View } from '@/tw';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

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

/** Chat bubbles flatten the corner nearest their speaker. */
const BUBBLE_RADIUS = 22;
const BUBBLE_TAIL_RADIUS = 8;

function newTurnId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AiChatScreen() {
  const { colors } = useTheme();
  const isWeb = Platform.OS === 'web';
  const insets = useSafeAreaInsets();
  const onTabBarScroll = useTabBarMinimizeOnScroll();
  const floating = useFloatingTabBar();

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
  const inputRef = useRef<RNTextInput>(null);
  const rootRef = useRef<RNView>(null);
  /*
   * Lifting the composer above the keyboard.
   *
   * Two things make this harder than it looks on Android:
   *   1. The app is edge-to-edge (required on API 35+), which makes the
   *      manifest's `adjustResize` a no-op — the window never resizes, so
   *      neither the OS nor Reanimated's `useAnimatedKeyboard` moved anything
   *      and the composer sat underneath the keyboard.
   *   2. This screen's container does not reach the bottom of the window (the
   *      tab bar sits below it), and how much space is below it *changes* when
   *      the keyboard opens. Measuring that gap up front and subtracting it
   *      under-lifted the composer by ~100dp, leaving it still covered.
   *
   * So measure at the moment the keyboard appears and compare the container's
   * real bottom edge against the keyboard's top edge (`screenY`). The overlap
   * between them is exactly how far the composer has to rise.
   */
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      const keyboardTop = event.endCoordinates.screenY;
      rootRef.current?.measureInWindow((_x, y, _w, height) => {
        const overlap = y + height - keyboardTop;
        setLift(overlap > 0 ? overlap : 0);
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setLift(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /*
   * Gboard under-reports its height by the ~20dp suggestion strip, so a flush
   * gap still clipped the composer's bottom edge. 24dp clears it and reads as
   * deliberate spacing between the keyboard and the composer.
   */
  const KEYBOARD_GAP = 24;
  /*
   * With Material tabs the scene stops above the bar, but the floating bar is
   * absolute chrome drawn over the scene — and it rides the keyboard up — so
   * the composer has to clear its full footprint in both states.
   */
  const floatingBarClearance = floating ? FLOATING_TAB_BAR_MARGIN + FLOATING_TAB_BAR_HEIGHT + 8 : 0;
  const composerStyle = {
    paddingBottom:
      lift > 0
        ? lift + KEYBOARD_GAP + floatingBarClearance
        : Math.max(insets.bottom, 8) + floatingBarClearance,
  };

  const geminiReady = healthQuery.data?.gemini_configured ?? true;
  const noModelsConfigured = !isWeb && aiModelSelections.length === 0;
  const proxyNotConfigured = !geminiReady && isWeb;
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
  }

  return (
    <RNView ref={rootRef} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen
        options={{
          headerRight:
            turns.length > 0
              ? () => (
                  <Pressable
                    onPress={resetChat}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Clear conversation"
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <Text className="text-sf-blue text-base font-medium">New chat</Text>
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
        scrollEventThrottle={16}
        onScroll={onTabBarScroll}
        contentContainerStyle={{
          gap: 14,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 20,
          flexGrow: turns.length === 0 ? 1 : undefined,
        }}
        ListEmptyComponent={
          <ChatIntro
            onCamera={pickFromCamera}
            onUseSample={(sample) => {
              setText(sample);
              inputRef.current?.focus();
            }}
          />
        }
      />

      <View style={[{ backgroundColor: colors.bg }, composerStyle]}>
        {noModelsConfigured ? (
          <SetupBanner
            icon="robot-outline"
            title="No AI model selected"
            subtitle="Pick a provider and models to start drafting"
            onPress={() => router.push('/settings/ai')}
          />
        ) : null}

        {proxyNotConfigured ? (
          <SetupBanner
            icon="alert-circle-outline"
            title="AI is not configured on the proxy"
            subtitle="Requests fail until LiteLLM or Gemini credentials are set"
          />
        ) : null}

        {staged.length > 0 ? (
          <StagedBar count={staged.length} onReset={resetChat} onReview={finalize} />
        ) : null}

        <Composer
          inputRef={inputRef}
          value={text}
          attachments={attachments}
          busy={busy}
          canSend={canSend}
          onChangeText={setText}
          onRemoveAttachment={removeAttachment}
          onPickLibrary={pickFromLibrary}
          onPickCamera={pickFromCamera}
          onSend={send}
        />
      </View>

      <NativeAlert
        visible={alert != null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        onDismiss={() => setAlert(null)}
      />
    </RNView>
  );
}

const SAMPLE_PROMPTS: { icon: IconName; text: string }[] = [
  { icon: 'calendar-check-outline', text: 'Plan a Friday launch checklist with reminders.' },
  { icon: 'bag-personal-outline', text: 'Make 5 packing tasks for a 3-day trip.' },
  {
    icon: 'format-list-checks',
    text: 'Turn this list into todos: groceries, gym, call mom, finish report.',
  },
];

function ChatIntro({
  onCamera,
  onUseSample,
}: {
  onCamera: () => void;
  onUseSample: (sample: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <View className="flex-1 justify-center gap-7 py-6">
      <View className="items-center gap-3">
        <View
          className="h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.primaryContainer }}>
          <MaterialCommunityIcons name={SPARKLE_ICON} size={36} color={colors.onPrimaryContainer} />
        </View>
        <Text
          className="text-sf-text text-center text-2xl font-bold"
          style={{ letterSpacing: -0.4 }}>
          Chat to draft tasks
        </Text>
        <Text
          className="text-sf-text-2 px-4 text-center text-base"
          style={{ lineHeight: 22, maxWidth: 340 }}>
          Describe what you need or attach a photo of your notes. Every reply comes back as draft
          tasks you can keep refining.
        </Text>
      </View>

      <View className="gap-2.5">
        <Text className="text-sf-text-3 px-1 text-xs font-semibold uppercase tracking-wide">
          Try saying
        </Text>
        {SAMPLE_PROMPTS.map((prompt) => (
          <SuggestionCard
            key={prompt.text}
            icon={prompt.icon}
            label={prompt.text}
            accessibilityLabel={`Use suggestion: ${prompt.text}`}
            onPress={() => onUseSample(prompt.text)}
          />
        ))}

        {Platform.OS !== 'web' ? (
          <SuggestionCard
            icon="camera-outline"
            label="Scan a photo of handwritten notes"
            accessibilityLabel="Take a photo of notes"
            tint={colors.accent}
            onPress={onCamera}
          />
        ) : null}
      </View>
    </View>
  );
}

function SuggestionCard({
  icon,
  label,
  accessibilityLabel,
  tint,
  onPress,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  tint?: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableRow
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      feedback="selection"
      scaleOnPress
      style={{ borderRadius: 20, overflow: 'hidden' }}>
      <GlassSurface radius={20} glassEffectStyle="clear">
        <View className="flex-row items-center gap-3 px-3.5 py-3" style={{ minHeight: 60 }}>
          <View
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: tint ? `${tint}22` : colors.primaryContainer }}>
            <MaterialCommunityIcons
              name={icon}
              size={19}
              color={tint ?? colors.onPrimaryContainer}
            />
          </View>
          <Text className="text-sf-text flex-1 text-[15px]" style={{ lineHeight: 20 }}>
            {label}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text3} />
        </View>
      </GlassSurface>
    </TouchableRow>
  );
}

/** Tappable status strip between the chat and the composer. */
function SetupBanner({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const content = (
    <View className="flex-row items-center gap-3 px-3.5 py-2.5" style={{ minHeight: 56 }}>
      <View
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: `${colors.orange}22` }}>
        <MaterialCommunityIcons name={icon} size={19} color={colors.orange} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sf-text text-sm font-semibold">{title}</Text>
        <Text className="text-sf-text-2 text-xs" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {onPress ? (
        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.text3} />
      ) : null}
    </View>
  );

  return (
    <View className="mx-3 mb-2">
      {onPress ? (
        <TouchableRow
          onPress={onPress}
          accessibilityLabel={title}
          scaleOnPress
          style={{ borderRadius: 20, overflow: 'hidden' }}>
          <GlassSurface radius={20} glassEffectStyle="clear">
            {content}
          </GlassSurface>
        </TouchableRow>
      ) : (
        <GlassSurface radius={20} glassEffectStyle="clear">
          {content}
        </GlassSurface>
      )}
    </View>
  );
}

function StagedBar({
  count,
  onReset,
  onReview,
}: {
  count: number;
  onReset: () => void;
  onReview: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="mx-3 mb-2">
      <GlassSurface radius={22}>
        <View className="flex-row items-center gap-3 px-3 py-2.5">
          <View
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.accent }}>
            <MaterialCommunityIcons name="check-all" size={19} color={colors.onAccent} />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-sf-text text-sm font-semibold">
              {count} task{count === 1 ? '' : 's'} drafted
            </Text>
            <Text className="text-sf-text-2 text-xs">Keep chatting to refine</Text>
          </View>
          <Pressable
            onPress={onReset}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Start over"
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.5 : 1,
            })}>
            <MaterialCommunityIcons name="restart" size={20} color={colors.text2} />
          </Pressable>
          <TouchableRow
            onPress={onReview}
            accessibilityLabel={`Review ${count} drafted tasks`}
            scaleOnPress
            hitSlop={6}
            style={{ borderRadius: 999, overflow: 'hidden' }}>
            <View
              className="items-center justify-center rounded-full px-4"
              style={{ backgroundColor: colors.accent, minHeight: 40, borderCurve: 'continuous' }}>
              <Text className="text-sf-on-accent text-sm font-semibold">Review</Text>
            </View>
          </TouchableRow>
        </View>
      </GlassSurface>
    </View>
  );
}

function Bubble({ turn, onRemoveTask }: { turn: ChatTurn; onRemoveTask: (taskIndex: number) => void }) {
  const { colors } = useTheme();
  const isUser = turn.role === 'user';

  if (isUser) {
    return (
      <View className="items-end">
        <View
          className="max-w-[86%] gap-2 px-3.5 py-2.5"
          style={{
            backgroundColor: colors.accent,
            borderRadius: BUBBLE_RADIUS,
            borderBottomRightRadius: BUBBLE_TAIL_RADIUS,
            borderCurve: 'continuous',
          }}>
          {turn.attachments && turn.attachments.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {turn.attachments.map((attachment, index) => (
                <Image
                  key={`${attachment.uri}-${index}`}
                  source={{ uri: attachment.uri }}
                  style={{ width: 110, height: 110, borderRadius: 14 }}
                  contentFit="cover"
                />
              ))}
            </View>
          ) : null}
          {turn.text ? (
            <Text className="text-sf-on-accent text-[15px]" style={{ lineHeight: 21 }} selectable>
              {turn.text}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <GlassSurface
      radius={BUBBLE_RADIUS}
      style={{ borderBottomLeftRadius: BUBBLE_TAIL_RADIUS, alignSelf: 'stretch' }}>
      <View className="gap-2.5 px-3.5 py-3">
        {turn.status === 'pending' ? (
          <View className="flex-row items-center gap-2.5">
            <LoadingSpinner size={20} />
            <Text className="text-sf-text-2 text-[15px]">Drafting…</Text>
          </View>
        ) : null}

        {turn.error ? (
          <View className="flex-row items-start gap-2.5">
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={19}
              color={colors.danger}
              style={{ marginTop: 1 }}
            />
            <Text className="text-sf-text flex-1 text-[15px]" style={{ lineHeight: 21 }} selectable>
              {turn.error}
            </Text>
          </View>
        ) : null}

        {turn.tasks && turn.tasks.length > 0 ? (
          <View className="gap-2">
            <Text className="text-sf-text-3 text-xs font-semibold uppercase tracking-wide">
              {turn.tasks.length} draft task{turn.tasks.length === 1 ? '' : 's'}
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
          <Text className="text-sf-text-2 text-[15px]">
            No tasks came out of that. Try rephrasing.
          </Text>
        ) : null}
      </View>
    </GlassSurface>
  );
}

function InlineTaskCard({ task, onRemove }: { task: AiGeneratedTask; onRemove: () => void }) {
  const { colors } = useTheme();
  const glass = useLiquidGlass();
  return (
    <View
      className="gap-1.5 px-3 py-2.5"
      style={{
        backgroundColor: glass ? `${colors.text}0F` : colors.bg3,
        borderRadius: 16,
        borderCurve: 'continuous',
      }}>
      <View className="flex-row items-start gap-2.5">
        <View className="mt-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: colors.accent }} />
        <Text className="text-sf-text flex-1 text-[15px] font-semibold" selectable>
          {task.title}
        </Text>
        <Pressable
          onPress={onRemove}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${task.title}`}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <MaterialCommunityIcons name="close" size={18} color={colors.text3} />
        </Pressable>
      </View>

      {task.description ? (
        <Text className="text-sf-text-2 pl-[18px] text-[13px]" style={{ lineHeight: 18 }} selectable>
          {task.description}
        </Text>
      ) : null}

      {task.due_at || task.tags.length > 0 || task.subtasks.length > 0 ? (
        <View className="flex-row flex-wrap items-center gap-1.5 pl-[18px] pt-0.5">
          {task.due_at ? (
            <MetaChip icon="calendar" label={new Date(task.due_at).toLocaleDateString()} />
          ) : null}
          {task.subtasks.length > 0 ? (
            <MetaChip
              icon="format-list-checks"
              label={`${task.subtasks.length} subtask${task.subtasks.length === 1 ? '' : 's'}`}
            />
          ) : null}
          {task.tags.map((tag) => (
            <Text key={tag} className="text-sf-text-3 text-[11px]">
              #{tag}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MetaChip({ icon, label }: { icon: IconName; label: string }) {
  const { colors } = useTheme();
  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
      style={{ backgroundColor: colors.bg2, borderCurve: 'continuous' }}>
      <MaterialCommunityIcons name={icon} size={11} color={colors.text2} />
      <Text className="text-sf-text-2 text-[11px]">{label}</Text>
    </View>
  );
}

function Composer({
  inputRef,
  value,
  attachments,
  busy,
  canSend,
  onChangeText,
  onRemoveAttachment,
  onPickLibrary,
  onPickCamera,
  onSend,
}: {
  inputRef: React.RefObject<RNTextInput | null>;
  value: string;
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
    <View className="mx-3">
      <GlassSurface radius={28}>
        <View className="gap-2 p-2">
          {attachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 4, paddingTop: 4 }}>
              {attachments.map((attachment, index) => (
                <View key={`${attachment.uri}-${index}`} style={{ position: 'relative' }}>
                  <Image
                    source={{ uri: attachment.uri }}
                    style={{ width: 60, height: 60, borderRadius: 14 }}
                    contentFit="cover"
                  />
                  <Pressable
                    onPress={() => onRemoveAttachment(index)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Remove attachment"
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 22,
                      height: 22,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 11,
                      backgroundColor: colors.bg,
                    }}>
                    <MaterialCommunityIcons name="close" size={14} color={colors.text} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View className="flex-row items-end gap-0.5">
            {Platform.OS !== 'web' ? (
              <>
                <ComposerIcon icon="camera-outline" label="Take photo" onPress={onPickCamera} />
                <ComposerIcon
                  icon="image-multiple-outline"
                  label="Attach from library"
                  onPress={onPickLibrary}
                />
              </>
            ) : null}

            {/*
              A plain controlled RN TextInput. `@expo/ui`'s TextInput is only a thin
              wrapper around this same component, and its `value` prop takes a
              native state object rather than a string — so it could never be
              controlled here, which is why clearing after send and filling from a
              suggestion did not work. The `Host` it needed was pure overhead.
            */}
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <TextInput
                ref={inputRef}
                value={value}
                onChangeText={onChangeText}
                placeholder={attachments.length > 0 ? 'Add a note (optional)' : 'Describe your tasks…'}
                placeholderTextColor={colors.text3}
                multiline
                autoCapitalize="sentences"
                underlineColorAndroid="transparent"
                cursorColor={colors.accent}
                selectionColor={colors.accent}
                // Grow with the message, but stop before the composer eats the chat.
                style={{
                  color: colors.text,
                  fontSize: 16,
                  lineHeight: 22,
                  minHeight: 40,
                  maxHeight: 120,
                  paddingHorizontal: 8,
                  paddingVertical: 9,
                  backgroundColor: 'transparent',
                }}
              />
            </View>

            <Pressable
              onPress={() => {
                haptics.impact('light');
                onSend();
              }}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !canSend }}
              hitSlop={8}
              style={({ pressed }) => ({
                padding: 2,
                transform: [{ scale: pressed && canSend ? 0.92 : 1 }],
              })}>
              <View
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{
                  // Muting the fill instead of the whole control keeps the
                  // disabled state legible against glass.
                  backgroundColor: canSend ? colors.accent : colors.bg3,
                  borderCurve: 'continuous',
                }}>
                {busy ? (
                  <LoadingSpinner size={18} />
                ) : (
                  <MaterialCommunityIcons
                    name="arrow-up"
                    size={20}
                    color={canSend ? colors.onAccent : colors.text3}
                  />
                )}
              </View>
            </Pressable>
          </View>
        </View>
      </GlassSurface>
    </View>
  );
}

function ComposerIcon({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.5 : 1,
      })}>
      <MaterialCommunityIcons name={icon} size={22} color={colors.text2} />
    </Pressable>
  );
}
