import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, RefreshControl } from 'react-native';

import type { BoardCardItem, BoardColumnItem } from '@/features/boards/model';
import { BoardCard } from '@/components/boards/board-card';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { ScrollView, Text, TextInput, View } from '@/tw';

/**
 * One board column, Jira-app style: a rounded surface with an uppercase
 * "TO DO  8" header, its cards scrolling inside, and an inline Create row
 * pinned to the bottom.
 */
export function BoardColumn({
  column,
  width,
  imageHeaders,
  refreshing,
  canCreate,
  emptyLabel = 'Nothing here',
  bottomInset,
  onRefresh,
  onOpenCard,
  onMoveCard,
  onCreate,
  onMenu,
}: {
  column: BoardColumnItem;
  width: number;
  imageHeaders?: Record<string, string>;
  refreshing: boolean;
  canCreate: boolean;
  emptyLabel?: string;
  bottomInset: number;
  onRefresh: () => void;
  onOpenCard: (card: BoardCardItem) => void;
  onMoveCard: (card: BoardCardItem) => void;
  onCreate: (title: string) => Promise<void>;
  onMenu?: () => void;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const title = draft?.trim();
    if (!title) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate(title);
      haptics.success();
      // Stay in the field so several cards can be added in a row.
      setDraft('');
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : 'Could not create the card.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View
      style={{
        width,
        flex: 1,
        marginBottom: bottomInset,
        borderRadius: 28,
        borderCurve: 'continuous',
        backgroundColor: colors.bg2,
        overflow: 'hidden',
      }}>
      <View className="flex-row items-center" style={{ paddingLeft: 20, paddingRight: 8, height: 56 }}>
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, fontSize: 14, fontWeight: '600', letterSpacing: 0.8, color: colors.text2 }}>
          {column.title.toUpperCase()}
        </Text>
        <Text
          style={{
            marginLeft: 10,
            fontSize: 14,
            fontWeight: '600',
            color: colors.text3,
            fontVariant: ['tabular-nums'],
          }}>
          {column.cards.length}
        </Text>
        <View style={{ flex: 1 }} />
        {onMenu ? (
          <Pressable
            onPress={onMenu}
            accessibilityRole="button"
            accessibilityLabel={`${column.title} options`}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.bg3 : 'transparent',
            })}>
            <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.accent} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bg3}
          />
        }>
        {column.cards.map((card) => (
          <BoardCard
            key={card.id}
            card={card}
            imageHeaders={imageHeaders}
            onPress={() => onOpenCard(card)}
            onLongPress={() => {
              haptics.impact('medium');
              onMoveCard(card);
            }}
          />
        ))}
        {column.cards.length === 0 && draft == null ? (
          <Text style={{ fontSize: 14, color: colors.text3, textAlign: 'center', paddingVertical: 24 }}>
            {emptyLabel}
          </Text>
        ) : null}
        {draft != null ? (
          <View style={{ borderRadius: 18, backgroundColor: colors.bg, padding: 14, gap: 8 }}>
            <TextInput
              autoFocus
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={submit}
              onBlur={() => {
                if (!draft.trim() && !saving) setDraft(null);
              }}
              placeholder="What needs to be done?"
              placeholderTextColor={colors.text3}
              returnKeyType="done"
              submitBehavior="submit"
              editable={!saving}
              style={{ fontSize: 16, color: colors.text, paddingVertical: 4 }}
            />
            {error ? <Text style={{ fontSize: 13, color: colors.danger }}>{error}</Text> : null}
            <View className="flex-row items-center justify-end" style={{ gap: 8 }}>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setDraft(null);
                  setError(null);
                }}
                accessibilityRole="button"
                style={{ paddingHorizontal: 14, height: 36, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text2 }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={saving || !draft.trim()}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  paddingHorizontal: 16,
                  height: 36,
                  borderRadius: pressed ? 10 : 18,
                  justifyContent: 'center',
                  backgroundColor: colors.accent,
                  opacity: saving || !draft.trim() ? 0.45 : 1,
                })}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.onAccent }}>Create</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {canCreate && draft == null ? (
        <Pressable
          onPress={() => {
            haptics.tap();
            setError(null);
            setDraft('');
          }}
          accessibilityRole="button"
          accessibilityLabel={`Create in ${column.title}`}
          android_ripple={{ color: colors.separator }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 20 }}>
          <MaterialCommunityIcons name="plus" size={24} color={colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.accent }}>Create</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
