import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PatchMascot, type MascotMood } from '@/components/mascot/patch-mascot';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { RiseIn } from '@/components/ui/motion';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { Switch } from '@/components/ui/switch';
import { haptics } from '@/lib/haptics';
import { PAISA } from '@/lib/motion';
import { COLOR_PALETTES } from '@/lib/palettes';
import { listTone } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { type ThemeMode, useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

type Step = 'welcome' | 'tour' | 'look' | 'connect';
const STEPS: Step[] = ['welcome', 'tour', 'look', 'connect'];

/**
 * Shows the first-run intro over the app until it is finished or skipped.
 * Settings has a row to see it again.
 */
export function OnboardingGate() {
  const show = useSettingsStore((s) => s.hydrated && !s.onboarded);
  if (!show || Platform.OS === 'web') return null;
  return (
    <Animated.View
      exiting={FadeOut.duration(260).reduceMotion(ReduceMotion.System)}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Onboarding />
    </Animated.View>
  );
}

/**
 * First-run intro, modelled on Paisa's setup: a welcome, a short tour, the
 * look, then where tasks come from. Every choice saves as it is made, so
 * skipping keeps whatever was picked.
 */
function Onboarding() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const setExtras = useSettingsStore((s) => s.setExtras);
  const [index, setIndex] = useState(0);
  const [forward, setForward] = useState(true);
  const step = STEPS[index];

  const finish = (then?: () => void) => {
    haptics.success();
    setExtras({ onboarded: true });
    then?.();
  };
  const next = () => {
    haptics.tap();
    setForward(true);
    setIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const back = () => {
    haptics.tap();
    setForward(false);
    setIndex((i) => Math.max(i - 1, 0));
  };

  useEffect(() => {
    if (index === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  }, [index]);

  const entering = (forward ? SlideInRight : SlideInLeft)
    .springify()
    .damping(PAISA.rise.damping)
    .stiffness(PAISA.rise.stiffness)
    .reduceMotion(ReduceMotion.System);

  return (
    <View
      accessibilityViewIsModal
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) + 12 }}>
      <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {step === 'welcome' ? (
          <View style={{ height: 56 }} />
        ) : (
          <TopBar progress={index / (STEPS.length - 1)} onBack={back} onSkip={() => finish()} />
        )}

        <Animated.View key={step} entering={entering} style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}>
            {step === 'welcome' ? <WelcomeStep /> : null}
            {step === 'tour' ? <TourStep /> : null}
            {step === 'look' ? <LookStep /> : null}
            {step === 'connect' ? <ConnectStep /> : null}
          </ScrollView>
        </Animated.View>

        <View style={{ paddingHorizontal: 24, gap: 10 }}>
          {step === 'connect' ? (
            <>
              <Button
                label="Connect an account"
                icon="cloud-sync-outline"
                onPress={() => finish(() => router.push('/settings/account'))}
                style={{ width: '100%' }}
              />
              <Button label="Look around first" variant="tonal" onPress={() => finish()} style={{ width: '100%' }} />
            </>
          ) : (
            <Button
              label={step === 'welcome' ? 'Get started' : 'Continue'}
              onPress={next}
              style={{ width: '100%' }}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function TopBar({ progress, onBack, onSkip }: { progress: number; onBack: () => void; onSkip: () => void }) {
  const { colors } = useTheme();
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: withSpring(progress, { damping: 20, stiffness: 180 }) }],
  }));
  return (
    <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 8 }}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={6}
        android_ripple={{ color: colors.separator, borderless: true, radius: 22 }}
        style={({ pressed }) => ({
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 22,
          opacity: pressed && Platform.OS === 'ios' ? 0.5 : 1,
        })}>
        <MaterialCommunityIcons name={Platform.OS === 'ios' ? 'chevron-left' : 'arrow-left'} size={26} color={colors.text} />
      </Pressable>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
        style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.gray3 }}>
        <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: colors.accent, transformOrigin: 'left' }, fill]} />
      </View>
      <Pressable
        onPress={onSkip}
        accessibilityRole="button"
        hitSlop={6}
        style={({ pressed }) => ({ minWidth: 64, height: 44, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 12, opacity: pressed ? 0.5 : 1 })}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.accent }}>Skip</Text>
      </Pressable>
    </View>
  );
}

function Heading({ title, body }: { title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 8, marginTop: 8, marginBottom: 24 }}>
      <Text accessibilityRole="header" style={{ fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.6, color: colors.text }}>
        {title}
      </Text>
      <Text style={{ fontSize: 17, lineHeight: 24, color: colors.text2 }}>{body}</Text>
    </View>
  );
}

function WelcomeStep() {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const mascot = Math.min(260, height * 0.3);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 28 }}>
      <RiseIn rise={40} fromScale={0.8}>
        <PatchMascot mood="hello" size={mascot} accessibilityLabel="Patch, the Patchwork mascot, waving" />
      </RiseIn>
      <RiseIn index={2} style={{ alignItems: 'center', gap: 10 }}>
        <Text
          accessibilityRole="header"
          style={{ fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8, color: colors.text, textAlign: 'center' }}>
          Hi, I&apos;m Patch.
        </Text>
        <Text style={{ fontSize: 17, lineHeight: 24, color: colors.text2, textAlign: 'center', maxWidth: 340 }}>
          Patchwork stitches your to-dos, boards and focus time into one app, synced with servers you already use.
        </Text>
      </RiseIn>
    </View>
  );
}

const TOUR: { title: string; body: string; mood: MascotMood }[] = [
  {
    title: 'Tasks',
    body: 'To-dos from Nextcloud, iCloud or any CalDAV server, with reminders, repeats and checklists.',
    mood: 'done',
  },
  {
    title: 'Boards',
    body: 'Nextcloud Deck, Jira and GitHub issues as columns you can drag cards between.',
    mood: 'board',
  },
  {
    title: 'Focus',
    body: 'A pomodoro timer, a stopwatch, and a brain dump for whatever is rattling around your head.',
    mood: 'focus',
  },
];

function TourStep() {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  return (
    <View>
      <Heading title="What's in here" body="Three things, sewn into one app." />
      {TOUR.map((item, i) => {
        const tone = listTone(colors, dark, i);
        return (
          <RiseIn key={item.title} index={i} rise={36} fromScale={0.94} style={{ marginTop: i === 0 ? 0 : -28, zIndex: i }}>
            <View
              style={{
                minHeight: 150,
                borderRadius: 32,
                borderCurve: 'continuous',
                backgroundColor: tone.fill,
                paddingLeft: 22,
                paddingRight: 12,
                paddingTop: 20,
                paddingBottom: i === TOUR.length - 1 ? 20 : 44,
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 8,
                boxShadow: i === 0 ? undefined : `0 -6px 18px ${withAlpha('#000000', dark ? 0.4 : 0.1)}`,
              }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: tone.ink }}>{item.title}</Text>
                <Text style={{ fontSize: 15, lineHeight: 21, color: withAlpha(tone.ink, 0.8) }}>{item.body}</Text>
              </View>
              <PatchMascot mood={item.mood} size={84} />
            </View>
          </RiseIn>
        );
      })}
    </View>
  );
}

const MODES: { label: string; value: ThemeMode }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

function LookStep() {
  const { colors, scheme } = useTheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const palette = useSettingsStore((s) => s.colorPalette);
  const setPalette = useSettingsStore((s) => s.setColorPalette);
  const pureBlack = useSettingsStore((s) => s.pureBlack);
  const setPureBlack = useSettingsStore((s) => s.setPureBlack);
  const dynamicColor = useSettingsStore((s) => s.dynamicColor);
  const setDynamicColor = useSettingsStore((s) => s.setDynamicColor);
  const android = Platform.OS === 'android';
  const selected = android && dynamicColor ? null : (palette ?? 'paper');

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Heading title="Make it yours" body="Pick a look. It changes as you tap, and Settings has more." />
        </View>
        <PatchMascot mood="idea" size={96} style={{ marginBottom: 20 }} />
      </View>

      <Group label="Theme">
        <SegmentedChoice options={MODES} value={themeMode} onChange={(mode) => {
          haptics.selection();
          setThemeMode(mode);
        }} />
      </Group>

      <Group label="Colors">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {android ? (
            <Swatch
              label="Wallpaper"
              color={colors.accent}
              icon="palette-outline"
              selected={dynamicColor}
              onPress={() => setDynamicColor(true)}
            />
          ) : null}
          {COLOR_PALETTES.map((p) => (
            <Swatch
              key={p.id}
              label={p.label}
              color={scheme === 'dark' ? p.primaryDark : p.primaryLight}
              selected={selected === p.id}
              onPress={() => setPalette(p.id)}
            />
          ))}
        </View>
      </Group>

      {scheme === 'dark' || themeMode !== 'light' ? (
        <Group label="Dark mode">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Pure black</Text>
              <Text style={{ fontSize: 14, color: colors.text2 }}>True black on OLED screens.</Text>
            </View>
            <Switch value={pureBlack} onValueChange={(v) => {
              haptics.toggle(v);
              setPureBlack(v);
            }} />
          </View>
        </Group>
      ) : null}
    </View>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 22, gap: 10 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.accent, letterSpacing: 0.2 }}>{label}</Text>
      <View style={{ borderRadius: 24, borderCurve: 'continuous', backgroundColor: colors.bg2, padding: 16 }}>{children}</View>
    </View>
  );
}

function Swatch({
  label,
  color,
  icon,
  selected,
  onPress,
}: {
  label: string;
  color: string;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={{ alignItems: 'center', gap: 6, width: 60 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: selected ? 18 : 26,
          borderCurve: 'continuous',
          borderWidth: 3,
          borderColor: selected ? colors.text : 'transparent',
          padding: 3,
        }}>
        <View
          style={{
            flex: 1,
            borderRadius: selected ? 13 : 20,
            borderCurve: 'continuous',
            backgroundColor: color,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {selected ? (
            <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
          ) : icon ? (
            <MaterialCommunityIcons name={icon} size={20} color="#FFFFFF" />
          ) : null}
        </View>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 12, color: selected ? colors.text : colors.text2, fontWeight: selected ? '700' : '400' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function ConnectStep() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Animated.View entering={FadeIn.delay(120)} style={{ alignItems: 'center', marginBottom: 12 }}>
        <PatchMascot mood="connect" size={190} accessibilityLabel="Patch holding up a plus card" />
      </Animated.View>
      <Heading
        title="Where do your tasks live?"
        body="Connect a CalDAV account to sync. Nextcloud, iCloud, Fastmail and other CalDAV servers work. Use an app password when your server offers one."
      />
      <View style={{ gap: 10 }}>
        {[
          { icon: 'shield-lock-outline' as const, text: 'Passwords stay in the device keychain.' },
          { icon: 'cloud-off-outline' as const, text: 'Edits made offline sync when you are back online.' },
        ].map((row) => (
          <View key={row.icon} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primaryContainer,
              }}>
              <MaterialCommunityIcons name={row.icon} size={20} color={colors.onPrimaryContainer} />
            </View>
            <Text style={{ flex: 1, fontSize: 15, color: colors.text2 }}>{row.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
