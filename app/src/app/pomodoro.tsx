import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { NativeAlert } from '@/components/ui/native-alert';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { SheetSurface } from '@/components/ui/sheet-surface';
import { haptics } from '@/lib/haptics';
import {
  formatClock,
  formatMinutes,
  recentHistory,
  sessionsOn,
  streak,
  usePomodoroStore,
  type FocusSession,
} from '@/stores/pomodoro-store';
import { useSettingsStore } from '@/stores/settings-store';
import { ScrollView, Text, View } from '@/tw';

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const MANUAL = [15, 30, 60];

type Mode = 'pomodoro' | 'stopwatch';

/**
 * Focus timer. Pomodoro counts down work blocks and breaks; Stopwatch counts
 * up until you stop it. Either way the time lands in today's log, which is
 * what "how much did I actually work today" reads from.
 */
export default function PomodoroScreen() {
  const { colors } = useTheme();
  const state = usePomodoroStore();
  const workMinutes = useSettingsStore((s) => s.pomodoroWorkMinutes);
  const [now, setNow] = useState(() => Date.now());
  const [chosenMode, setChosenMode] = useState<Mode>('pomodoro');
  const [removing, setRemoving] = useState<FocusSession | null>(null);

  useEffect(() => {
    void usePomodoroStore.getState().settle();
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
  }, []);

  const running = state.phase !== 'idle';
  // A running timer decides the mode; the switch only matters when idle.
  const mode: Mode = state.phase === 'stopwatch' ? 'stopwatch' : running ? 'pomodoro' : chosenMode;
  const paused = state.pausedRemaining != null || state.pausedElapsed != null;
  const task = state.taskUid && state.taskTitle ? { uid: state.taskUid, title: state.taskTitle } : undefined;

  let display: number;
  let progress = 0;
  if (state.phase === 'stopwatch') {
    display = state.pausedElapsed ?? (state.startedAt != null ? now - state.startedAt : 0);
  } else if (state.phase === 'idle') {
    display = mode === 'stopwatch' ? 0 : workMinutes * 60_000;
  } else {
    display = state.endsAt != null ? state.endsAt - now : (state.pausedRemaining ?? 0);
    progress = Math.min(1, Math.max(0, 1 - display / (state.phaseMinutes * 60_000)));
  }

  const week = recentHistory(state.history, 7);
  const today = week[week.length - 1];
  const best = Math.max(1, ...week.map((day) => day.minutes));
  const days = streak(state.history);
  const todaySessions = useMemo(() => sessionsOn(state.sessions, new Date()), [state.sessions]);
  const tint = state.phase === 'break' ? colors.green : colors.accent;
  const label =
    state.phase === 'work'
      ? 'Focus'
      : state.phase === 'break'
        ? 'Break'
        : state.phase === 'stopwatch'
          ? 'Tracking'
          : 'Ready';

  return (
    <SheetSurface title="Focus timer" subtitle={state.taskTitle ?? 'Time spent today, by block or by stopwatch'}>
      <Stack.Screen options={{ title: 'Focus' }} />
      <ScrollView
        className="flex-1"
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 20, gap: 22 }}>
        {!running ? (
          <View style={{ paddingTop: 12 }}>
            <SegmentedChoice
              options={[
                { label: 'Pomodoro', value: 'pomodoro' as Mode },
                { label: 'Stopwatch', value: 'stopwatch' as Mode },
              ]}
              value={chosenMode}
              onChange={setChosenMode}
            />
          </View>
        ) : null}

        <View className="items-center gap-2" style={{ paddingTop: running ? 16 : 0 }}>
          <Text className="text-sm font-semibold uppercase" style={{ letterSpacing: 1.2, color: tint }}>
            {label}
            {paused ? ' · Paused' : ''}
          </Text>
          <Text
            accessibilityRole="timer"
            className="text-sf-text"
            style={{ fontSize: 72, fontWeight: '200', fontVariant: ['tabular-nums'] }}>
            {formatClock(display)}
          </Text>
          {mode === 'pomodoro' ? (
            <View
              style={{ alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: colors.bg3, overflow: 'hidden' }}>
              <View style={{ width: `${progress * 100}%`, height: '100%', backgroundColor: tint, borderRadius: 4 }} />
            </View>
          ) : null}
        </View>

        <View className="gap-3">
          {!running ? (
            <Button
              label={mode === 'stopwatch' ? 'Start stopwatch' : `Start ${workMinutes} minute focus`}
              icon="play"
              onPress={() => {
                haptics.impact('medium');
                void (mode === 'stopwatch' ? state.startStopwatch(task) : state.start(task));
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
                {state.phase !== 'stopwatch' ? (
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
                ) : null}
                <View style={{ flex: 1 }}>
                  <Button
                    variant={state.phase === 'stopwatch' ? 'tonal' : 'text'}
                    label={state.phase === 'stopwatch' ? 'Stop and log' : 'Stop'}
                    icon={state.phase === 'stopwatch' ? 'stop' : undefined}
                    onPress={() => {
                      haptics.success();
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
            <Stat label="Today" value={formatMinutes(today.minutes)} detail={`${today.sessions} pomodoros`} />
            <Stat
              label="This week"
              value={formatMinutes(week.reduce((sum, d) => sum + d.minutes, 0))}
              detail="focused"
            />
            <Stat label="Streak" value={`${days}`} detail={days === 1 ? 'day' : 'days'} />
          </View>
          <View className="flex-row items-end justify-between" style={{ height: 72, paddingTop: 8 }}>
            {week.map((day) => (
              <View key={day.key} className="items-center gap-1" style={{ flex: 1 }}>
                <View
                  accessibilityLabel={`${day.date.toDateString()}: ${formatMinutes(day.minutes)}`}
                  style={{
                    width: 18,
                    height: Math.max(4, (day.minutes / best) * 48),
                    borderRadius: 6,
                    backgroundColor: day.minutes ? colors.accent : colors.gray2,
                  }}
                />
                <Text className="text-sf-text-3" style={{ fontSize: 11 }}>
                  {weekday.format(day.date)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-sf-text text-lg font-semibold">Today&apos;s log</Text>
            <View className="flex-row gap-2">
              {MANUAL.map((minutes) => (
                <Pressable
                  key={minutes}
                  onPress={() => {
                    haptics.selection();
                    state.logManual(minutes, task);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${minutes} minutes by hand`}
                  style={({ pressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: colors.bg3,
                    opacity: pressed ? 0.6 : 1,
                  })}>
                  <Text style={{ fontSize: 13, color: colors.text }}>+{formatMinutes(minutes)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {todaySessions.length === 0 ? (
            <Text className="text-sf-text-3 py-3 text-sm">
              Nothing logged yet. Finished pomodoros and stopped stopwatches show up here.
            </Text>
          ) : (
            todaySessions.map((session) => (
              <Pressable
                key={session.id}
                onLongPress={() => setRemoving(session)}
                accessibilityHint="Long-press to remove"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
                <MaterialCommunityIcons
                  name={session.kind === 'pomodoro' ? 'timer-outline' : 'timer-play-outline'}
                  size={20}
                  color={colors.text2}
                />
                <View style={{ flex: 1 }}>
                  <Text className="text-sf-text text-base" numberOfLines={1}>
                    {session.title ?? (session.kind === 'pomodoro' ? 'Pomodoro' : 'Stopwatch')}
                  </Text>
                  <Text className="text-sf-text-3 text-xs">
                    {time.format(new Date(session.start))} – {time.format(new Date(session.end))}
                  </Text>
                </View>
                <Text className="text-sf-text-2 text-base" style={{ fontVariant: ['tabular-nums'] }}>
                  {formatMinutes(session.minutes)}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <Text className="text-sf-text-3 text-center text-xs">
          The running timer shows on your lock screen and status bar. Change pomodoro lengths in Settings.
        </Text>
      </ScrollView>

      <NativeAlert
        visible={removing != null}
        title="Remove this entry?"
        message={removing ? `${formatMinutes(removing.minutes)} comes off today's total.` : ''}
        confirmLabel="Remove"
        dismissLabel="Keep"
        onDismiss={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) state.removeSession(removing.id);
          setRemoving(null);
        }}
      />
    </SheetSurface>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View className="items-center" style={{ flex: 1 }}>
      <Text className="text-sf-text-2 text-xs">{label}</Text>
      <Text className="text-sf-text" style={{ fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text className="text-sf-text-3 text-xs">{detail}</Text>
    </View>
  );
}
