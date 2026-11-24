import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Platform, Pressable } from 'react-native';

import { initials, nameColor, type BoardCardItem } from '@/features/boards/model';
import { priorityTone } from '@/components/boards/board-tone';
import { useTheme } from '@/components/theme/context';
import { mixHex, withAlpha } from '@/lib/theme';
import { formatRelativeDue } from '@/lib/format';
import { Text, View } from '@/tw';
import { ELASTIC_CARD, ElasticView } from '@/components/ui/motion';

/**
 * A card on a board column, in the soft board style: priority and labels as
 * tinted chips on top (the Jira key on the right), a bold title with the
 * first line of the description under it, checklist progress as a bar, and a
 * footer of assignees on the left and due date, attachment and comment counts
 * as small pills on the right.
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
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const due = formatRelativeDue(card.due ?? null);
  const priority = priorityTone(card.priorityName, colors, dark);
  const percent = card.progress ? Math.round((card.progress.done / card.progress.total) * 100) : null;

  return (
    <View
      style={{
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: dark ? colors.bg2 : colors.bg,
        borderCurve: 'continuous',
        boxShadow: dark ? undefined : `0 1px 3px ${withAlpha('#000000', 0.06)}`,
      }}>
      <ElasticView {...ELASTIC_CARD} glowRadius={20}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        accessibilityRole="button"
        accessibilityLabel={[card.priorityName ? `${card.priorityName} priority` : null, card.key, card.title, percent != null ? `${percent}% done` : null]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint={onLongPress ? 'Long press to move to another column' : 'Long press and drag to move'}
        android_ripple={{ color: colors.separator }}
        style={({ pressed }) => ({
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 14,
          gap: 10,
          opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1,
        })}>
        {/* Priority and labels as chips, the issue key on the right. */}
        {priority || card.labels.length > 0 || card.key ? (
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <View className="flex-row flex-wrap" style={{ gap: 6, flex: 1 }}>
              {priority && card.priorityName ? (
                <Chip label={card.priorityName} bg={priority.bg} ink={priority.ink} />
              ) : null}
              {card.labels.slice(0, 3).map((label, index) => (
                <Chip
                  key={`${label.title}-${index}`}
                  label={label.title}
                  bg={label.color ? withAlpha(label.color, dark ? 0.3 : 0.18) : colors.bg3}
                  ink={label.color ? (dark ? mixHex(label.color, '#FFFFFF', 0.4) : mixHex(label.color, '#000000', 0.4)) : colors.text2}
                />
              ))}
            </View>
            {card.key ? (
              <View className="flex-row items-center" style={{ gap: 4 }}>
                {card.typeIconUrl ? (
                  <Image
                    source={{ uri: card.typeIconUrl, headers: imageHeaders }}
                    style={{ width: 14, height: 14 }}
                    accessibilityLabel={card.typeName}
                  />
                ) : null}
                <Text style={{ fontSize: 12, fontWeight: '500', color: colors.text3, letterSpacing: 0.3 }}>{card.key}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: colors.text }}>{card.title}</Text>
          {card.note ? (
            <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, color: colors.text2 }}>
              {card.note}
            </Text>
          ) : null}
        </View>

        {percent != null ? <ProgressBar percent={percent} /> : null}

        <View className="flex-row items-center" style={{ gap: 6, minHeight: 28 }}>
          {card.assignee ? (
            <Avatar name={card.assignee.name} url={card.assignee.avatarUrl} headers={imageHeaders} />
          ) : null}
          {(card.assigneeCount ?? 0) > 1 ? (
            <Text style={{ fontSize: 12, color: colors.text2 }}>+{(card.assigneeCount ?? 1) - 1}</Text>
          ) : null}
          <View style={{ flex: 1 }} />
          {due.label ? (
            <CountPill icon="clock-outline" label={due.label} alert={due.overdue} />
          ) : null}
          {card.attachments ? <CountPill icon="paperclip" label={String(card.attachments)} /> : null}
          {card.comments ? <CountPill icon="comment-outline" label={String(card.comments)} /> : null}
          {!card.note && card.hasDescription ? <CountPill icon="text" /> : null}
        </View>
      </Pressable>
      </ElasticView>
    </View>
  );
});

function Chip({ label, bg, ink }: { label: string; bg: string; ink: string }) {
  return (
    <View style={{ borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: bg }}>
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: ink }}>
        {label}
      </Text>
    </View>
  );
}

/** "Progress  60%" over a rounded bar that fills to the share of ticked checklist items. */
function ProgressBar({ percent }: { percent: number }) {
  const { colors } = useTheme();
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.set(withTiming(percent / 100, { duration: 520, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
  }, [percent, fill]);
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={{ gap: 6 }}>
      <View className="flex-row items-center">
        <Text style={{ flex: 1, fontSize: 12, color: colors.text3 }}>Progress</Text>
        <Text style={{ fontSize: 12, color: colors.text3, fontVariant: ['tabular-nums'] }}>{percent}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.bg3, overflow: 'hidden' }}>
        <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: colors.accent }, bar]} />
      </View>
    </View>
  );
}

function CountPill({
  icon,
  label,
  alert,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label?: string;
  alert?: boolean;
}) {
  const { colors } = useTheme();
  const color = alert ? colors.red : colors.text2;
  return (
    <View
      className="flex-row items-center"
      style={{ gap: 3, height: 24, paddingHorizontal: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.separator }}>
      <MaterialCommunityIcons name={icon} size={13} color={color} />
      {label ? <Text style={{ fontSize: 12, color }}>{label}</Text> : null}
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
