import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { ElasticPressable } from '@/components/ui/motion';
import { haptics } from '@/lib/haptics';
import { EXPAND_IN, COLLAPSE_OUT, expandLayout } from '@/lib/motion';
import { blockMinutes, formatLength, formatTime, withEnd, withStart } from '@/lib/time-block';
import { usePomodoroStore } from '@/stores/pomodoro-store';
import { Text, View } from '@/tw';

const IOS = Platform.OS === 'ios';

export interface TimeBlockValue {
  start_at: string | null;
  due_at: string | null;
}

/**
 * Start and end time for a to-do (VTODO DTSTART and DUE), plus the focus
 * timer sized to the block or a stopwatch for it. iOS lays it out like a
 * Calendar event, with Starts and Ends rows and compact time pickers; Android
 * has two tonal time pills that open the Material time dialog.
 */
export function TimeBlockField({
  value,
  onChange,
  task,
}: {
  value: TimeBlockValue;
  onChange: (next: TimeBlockValue) => void;
  /** The to-do the timer logs against. A to-do still being written has none, so no timer yet. */
  task?: { uid: string; title: string };
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState<'start' | 'end' | null>(null);
  const start = value.start_at ? new Date(value.start_at) : null;
  const end = start && value.due_at ? new Date(value.due_at) : null;
  const minutes = blockMinutes(value);
  const set = (which: 'start' | 'end', date: Date) => {
    haptics.selection();
    const update = which === 'start' ? withStart : withEnd;
    onChange(update(value, date.getHours(), date.getMinutes()));
  };
  const addBlock = () => {
    haptics.tap();
    // Next whole hour, on the to-do's day.
    const now = new Date();
    onChange(withStart(value, Math.min(22, now.getHours() + 1), 0));
  };
  const focus = (kind: 'timer' | 'stopwatch') => {
    haptics.impact('medium');
    if (!task) return;
    const store = usePomodoroStore.getState();
    if (kind === 'timer' && minutes) void store.startFor(minutes, task);
    else void store.startStopwatch(task);
    router.push('/pomodoro');
  };

  return (
    <Animated.View layout={expandLayout()} style={{ gap: 12 }}>
      <View className="flex-row items-center gap-3" style={{ minHeight: 32 }}>
        <MaterialCommunityIcons name="clock-time-four-outline" size={20} color={colors.accent} />
        <View style={{ flex: 1 }}>
          <Text className="text-sf-text text-base">Time block</Text>
          <Text className="text-sf-text-2 text-sm">
            {start && end && minutes ? `${formatTime(start)} – ${formatTime(end)} · ${formatLength(minutes)}` : 'Not set'}
          </Text>
        </View>
        {start ? (
          <Pressable
            onPress={() => {
              haptics.tap();
              onChange({ start_at: null, due_at: value.due_at });
            }}
            accessibilityRole="button"
            accessibilityLabel="Remove time block"
            hitSlop={8}
            style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
            <MaterialCommunityIcons name="close" size={20} color={colors.text2} />
          </Pressable>
        ) : (
          <ElasticPressable
            variant="control"
            radius={18}
            onPress={addBlock}
            accessibilityRole="button"
            accessibilityLabel="Add start and end time"
            style={{
              height: 36,
              paddingHorizontal: 14,
              borderRadius: 18,
              backgroundColor: colors.selectionBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Text style={{ color: colors.onSelectionBg, fontWeight: '600', fontSize: 14 }}>Add</Text>
          </ElasticPressable>
        )}
      </View>

      {start && end ? (
        <Animated.View entering={EXPAND_IN} exiting={COLLAPSE_OUT} style={{ gap: 12 }}>
          {IOS ? (
            <View style={{ gap: 4, paddingLeft: 32 }}>
              <IosTimeRow label="Starts" date={start} onChange={(d) => set('start', d)} />
              <IosTimeRow label="Ends" date={end} onChange={(d) => set('end', d)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 32 }}>
              <TimePill label="Start" date={start} onPress={() => setEditing('start')} />
              <MaterialCommunityIcons name="arrow-right" size={18} color={colors.text3} style={{ alignSelf: 'center' }} />
              <TimePill label="End" date={end} onPress={() => setEditing('end')} />
            </View>
          )}
          {task ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingLeft: 32 }}>
            <View style={{ flex: 1 }}>
              <Button
                label={minutes ? `Focus ${formatLength(minutes)}` : 'Focus'}
                icon="play"
                variant="tonal"
                minHeight={44}
                onPress={() => focus('timer')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Stopwatch" icon="timer-outline" variant="outlined" minHeight={44} onPress={() => focus('stopwatch')} />
            </View>
          </View>
          ) : null}
        </Animated.View>
      ) : null}

      {!IOS && editing && start && end ? (
        <DateTimePicker
          mode="time"
          presentation="dialog"
          accentColor={colors.accent}
          value={editing === 'start' ? start : end}
          onValueChange={(_event, selected) => {
            const which = editing;
            setEditing(null);
            set(which, selected);
          }}
          onDismiss={() => setEditing(null)}
        />
      ) : null}
    </Animated.View>
  );
}

function IosTimeRow({ label, date, onChange }: { label: string; date: Date; onChange: (date: Date) => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center" style={{ minHeight: 44 }}>
      <Text style={{ flex: 1, fontSize: 17, color: colors.text }}>{label}</Text>
      <DateTimePicker
        mode="time"
        display="compact"
        accentColor={colors.accent}
        value={date}
        onValueChange={(_event, selected) => onChange(selected)}
      />
    </View>
  );
}

/** M3 tonal pill showing a time; tapping it opens the time dialog. */
function TimePill({ label, date, onPress }: { label: string; date: Date; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <ElasticPressable
      variant="control"
      radius={20}
      containerStyle={{ flex: 1 }}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${formatTime(date)}. Change`}
      style={{
        minHeight: 56,
        borderRadius: 20,
        backgroundColor: colors.bg3,
        paddingHorizontal: 16,
        justifyContent: 'center',
      }}>
      <Text style={{ fontSize: 12, color: colors.text2 }}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] }}>
        {formatTime(date)}
      </Text>
    </ElasticPressable>
  );
}
