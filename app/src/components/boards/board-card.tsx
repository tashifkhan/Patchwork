import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Platform, Pressable } from 'react-native';

import { initials, nameColor, type BoardCardItem } from '@/features/boards/model';
import { useTheme } from '@/components/theme/context';
import { formatRelativeDue } from '@/lib/format';
import { Text, View } from '@/tw';

/**
 * A card on a board column, laid out like the Jira app: title on top, then a
 * footer with the issue type and key on the left and priority plus assignee
 * on the right. Deck cards use the same footer with labels and due date.
 */
export const BoardCard = memo(function BoardCard({
  card,
  imageHeaders,
  onPress,
  onLongPress,
}: {
  card: BoardCardItem;
  imageHeaders?: Record<string, string>;
  onPress: () => void;
  /** Without it the card is draggable, and the board's gesture owns long-press. */
  onLongPress?: () => void;
}) {
  const { colors } = useTheme();
  const due = formatRelativeDue(card.due ?? null);

  return (
    <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: colors.bg, borderCurve: 'continuous' }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={[card.key, card.title].filter(Boolean).join(', ')}
        accessibilityHint={onLongPress ? 'Long press to move to another column' : 'Long press and drag to move'}
        android_ripple={{ color: colors.separator }}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 12,
          gap: 10,
          opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1,
        })}>
        {card.labels.length > 0 ? (
          <View className="flex-row flex-wrap" style={{ gap: 6 }}>
            {card.labels.slice(0, 4).map((label, index) => (
              <View
                key={`${label.title}-${index}`}
                style={{
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  backgroundColor: label.color ?? colors.bg3,
                }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 12, fontWeight: '600', color: label.color ? '#FFFFFF' : colors.text2 }}>
                  {label.title}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={{ fontSize: 16, lineHeight: 22, color: colors.text }}>{card.title}</Text>

        <View className="flex-row items-center" style={{ gap: 8, minHeight: 26 }}>
          {card.key ? (
            <>
              {card.typeIconUrl ? (
                <Image
                  source={{ uri: card.typeIconUrl, headers: imageHeaders }}
                  style={{ width: 16, height: 16 }}
                  accessibilityLabel={card.typeName}
                />
              ) : (
                <MaterialCommunityIcons name="checkbox-marked-outline" size={16} color={colors.accent} />
              )}
              <Text style={{ fontSize: 13, fontWeight: '500', color: colors.text2, letterSpacing: 0.3 }}>
                {card.key}
              </Text>
            </>
          ) : null}
          {due.label ? (
            <View className="flex-row items-center" style={{ gap: 4 }}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={14}
                color={due.overdue ? colors.red : colors.text2}
              />
              <Text style={{ fontSize: 13, color: due.overdue ? colors.red : colors.text2 }}>{due.label}</Text>
            </View>
          ) : null}
          {card.hasDescription ? (
            <MaterialCommunityIcons name="text" size={15} color={colors.text3} />
          ) : null}

          <View style={{ flex: 1 }} />

          {card.priorityName || card.priorityIconUrl ? (
            <PriorityBadge name={card.priorityName} iconUrl={card.priorityIconUrl} headers={imageHeaders} />
          ) : null}
          {card.assignee ? (
            <Avatar name={card.assignee.name} url={card.assignee.avatarUrl} headers={imageHeaders} />
          ) : null}
          {(card.assigneeCount ?? 0) > 1 ? (
            <Text style={{ fontSize: 12, color: colors.text2 }}>+{(card.assigneeCount ?? 1) - 1}</Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});

/** Jira's stock priorities as glyphs; custom ones fall back to Jira's own icon. */
const PRIORITY_GLYPHS: Record<string, { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string }> = {
  highest: { icon: 'chevron-double-up', color: '#E5493A' },
  high: { icon: 'chevron-up', color: '#E5493A' },
  medium: { icon: 'equal', color: '#E2861B' },
  low: { icon: 'chevron-down', color: '#2D8738' },
  lowest: { icon: 'chevron-double-down', color: '#2D8738' },
};

function PriorityBadge({
  name,
  iconUrl,
  headers,
}: {
  name?: string;
  iconUrl?: string;
  headers?: Record<string, string>;
}) {
  const { colors } = useTheme();
  const glyph = name ? PRIORITY_GLYPHS[name.toLowerCase()] : undefined;
  return (
    <View
      accessible
      accessibilityLabel={name ? `${name} priority` : 'Priority'}
      style={{
        width: 26,
        height: 26,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.bg2,
      }}>
      {glyph ? (
        <MaterialCommunityIcons name={glyph.icon} size={18} color={glyph.color} />
      ) : iconUrl ? (
        <Image source={{ uri: iconUrl, headers }} style={{ width: 14, height: 14 }} />
      ) : null}
    </View>
  );
}

function Avatar({ name, url, headers }: { name: string; url?: string; headers?: Record<string, string> }) {
  const size = 26;
  if (url) {
    return (
      <Image
        source={{ uri: url, headers }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        accessibilityLabel={`Assigned to ${name}`}
      />
    );
  }
  return (
    <View
      accessible
      accessibilityLabel={`Assigned to ${name}`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: nameColor(name),
      }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>{initials(name)}</Text>
    </View>
  );
}
