import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { haptics } from '@/lib/haptics';
import { recentHistory, streak, usePomodoroStore } from '@/stores/pomodoro-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, Text, View } from '@/tw';

function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });

/**
 * Focus timer. Opened from a to-do's timer button (focused on that to-do) or
 * from Settings (no to-do). Work and break lengths live in Settings.
 */
export default function PomodoroScreen() {
  const { colors } = useTheme();
  const state = usePomodoroStore();
  const workMinutes = useSettingsStore((s) => s.pomodoroWorkMinutes);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void state.settle();
    const timer = setInterval(() => {
      setNow(Date.now());
      void usePomodoroStore.getState().settle();
    }, 500);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void usePomodoroStore.getState().settle();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
    // Run once; the interval reads fresh state itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = state.endsAt != null;
  const paused = state.pausedRemaining != null;
  const remaining = running ? state.endsAt! - now : paused ? state.pausedRemaining! : workMinutes * 60_000;
  const total = (state.phase === 'idle' ? workMinutes : state.phaseMinutes) * 60_000;
  const progress = state.phase === 'idle' ? 0 : Math.min(1, Math.max(0, 1 - remaining / total));
  const week = recentHistory(state.history, 7);
  const today = week[week.length - 1];
  const best = Math.max(1, ...week.map((day) => day.sessions));
  const days = streak(state.history);
  const tint = state.phase === 'break' ? colors.green : colors.accent;

  return (
    <SheetSurface title="Focus timer" subtitle={state.taskTitle ?? 'Work in blocks, rest in between'}>
      <Stack.Screen options={{ title: 'Focus' }} />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 20, gap: 24 }}>
        <View className="items-center gap-2 pt-6">
          <Text
            className="text-sf-text-2 text-sm font-semibold uppercase"
            style={{ letterSpacing: 1.2, color: tint }}>
            {state.phase === 'work' ? 'Focus' : state.phase === 'break' ? 'Break' : 'Ready'}
            {paused ? ' · Paused' : ''}
          </Text>
          <Text
            accessibilityRole="timer"
            accessibilityLabel={`${Math.ceil(remaining / 60_000)} minutes left`}
            className="text-sf-text"
            style={{ fontSize: 72, fontWeight: '200', fontVariant: ['tabular-nums'] }}>
            {clock(remaining)}
          </Text>
          <View
            style={{ alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: colors.bg3, overflow: 'hidden' }}>
            <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: tint, borderRadius: 4 }} />
          </View>
        </View>

        <View className="gap-3">
          {state.phase === 'idle' ? (
            <Button
              label={`Start ${workMinutes} minute focus`}
              icon="play"
              onPress={() => {
                haptics.impact('medium');
                void state.start(state.taskUid && state.taskTitle ? { uid: state.taskUid, title: state.taskTitle } : undefined);
              }}
            />
          ) : (
            <>
              <Button
                label={paused ? 'Resume' : 'Pause'}
                icon={paused ? 'play' : 'pause'}
                onPress={() => {
                  haptics.tap();
                  void (paused ? state.resume() : state.pause());
                }}
              />
              <View className="flex-row gap-3">
                <View style={{ flex: 1 }}>
                  <Button
                    variant="tonal"
                    label={state.phase === 'work' ? 'Skip to break' : 'End break'}
                    onPress={() => {
                      haptics.tap();
                      void state.skip();
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    variant="text"
                    label="Stop"
                    onPress={() => {
                      haptics.warning();
                      void state.stop();
                    }}
                  />
                </View>
              </View>
            </>
          )}
        </View>

        <View className="gap-3 rounded-3xl p-4" style={{ backgroundColor: colors.bg3, borderCurve: 'continuous' }}>
          <View className="flex-row justify-between">
            <Stat label="Today" value={`${today.sessions}`} detail={`${today.minutes} min`} />
            <Stat label="This week" value={`${week.reduce((sum, d) => sum + d.sessions, 0)}`} detail="blocks" />
            <Stat label="Streak" value={`${days}`} detail={days === 1 ? 'day' : 'days'} />
          </View>
          <View className="flex-row items-end justify-between" style={{ height: 72, paddingTop: 8 }}>
            {week.map((day) => (
              <View key={day.key} className="items-center gap-1" style={{ flex: 1 }}>
                <View
                  accessibilityLabel={`${day.date.toDateString()}: ${day.sessions} blocks`}
                  style={{
                    width: 18,
                    height: Math.max(4, (day.sessions / best) * 48),
                    borderRadius: 6,
                    backgroundColor: day.sessions ? colors.accent : colors.gray2,
                  }}
                />
                <Text className="text-sf-text-3" style={{ fontSize: 11 }}>
                  {weekday.format(day.date)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Text className="text-sf-text-3 text-center text-xs">
          You get a notification when a block or break ends, even with the app closed. Change the lengths in
          Settings.
        </Text>
      </ScrollView>
    </SheetSurface>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View className="items-center" style={{ flex: 1 }}>
      <Text className="text-sf-text-2 text-xs">{label}</Text>
      <Text className="text-sf-text" style={{ fontSize: 28, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text className="text-sf-text-3 text-xs">{detail}</Text>
    </View>
  );
}
