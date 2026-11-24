import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, Pressable } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { PatchMascot, type MascotMood } from '@/components/mascot/patch-mascot';
import {
  RowSeparator,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { RiseIn } from '@/components/ui/motion';
import { haptics } from '@/lib/haptics';
import { withAlpha } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';
import { Text, View } from '@/tw';

const REPO = 'https://github.com/tashifkhan/Patchwork';
const IOS = Platform.OS === 'ios';

/** What Patch cycles through when tapped. */
const MOODS: MascotMood[] = ['hello', 'done', 'board', 'focus', 'idea', 'curious', 'thinking', 'guard', 'sleepy', 'oops'];

function open(url: string) {
  haptics.tap();
  void WebBrowser.openBrowserAsync(url).catch(() => {});
}

/** About Patchwork: who Patch is, where data goes, help, and the project's links. */
export default function AboutScreen() {
  const { colors } = useTheme();
  const setExtras = useSettingsStore((s) => s.setExtras);
  const external = <MaterialCommunityIcons name="open-in-new" size={18} color={colors.text3} />;

  return (
    <SettingsScreen>
      <Identity />

      <SettingsGroup title="Where your data goes">
        <SettingsRow
          icon="calendar-check-outline"
          sf="checklist"
          title="Tasks"
          subtitle="On your CalDAV server. This phone keeps a copy so lists open offline, and edits made offline wait until it can send them."
        />
        <RowSeparator />
        <SettingsRow
          icon="key-outline"
          sf="key"
          title="Passwords and tokens"
          subtitle="In the device keychain, kept out of cloud backups."
        />
        <RowSeparator />
        <SettingsRow
          icon="view-column-outline"
          sf="rectangle.split.3x1"
          title="Boards and issues"
          subtitle="Nextcloud Deck, Jira and GitHub are called straight from this phone. No Patchwork server sits in between."
        />
        <RowSeparator />
        <SettingsRow
          icon="star-four-points-outline"
          sf="sparkles"
          title="AI"
          subtitle="Off until you set it up. On-device runs on the phone. Cloud providers only see what you send."
        />
      </SettingsGroup>

      <SettingsGroup title="Help">
        <SettingsRow
          icon="replay"
          sf="arrow.counterclockwise"
          title="Show the intro again"
          subtitle="The welcome, the tour, colors and accounts"
          onPress={() => {
            haptics.tap();
            setExtras({ onboarded: false });
          }}
        />
        <RowSeparator />
        <SettingsRow
          icon="bug-outline"
          sf="ladybug"
          title="Report a problem"
          subtitle="Open an issue on GitHub"
          trailing={external}
          onPress={() => open(`${REPO}/issues/new`)}
        />
      </SettingsGroup>

      <SettingsGroup title="Project">
        <SettingsRow
          icon="github"
          sf="chevron.left.forwardslash.chevron.right"
          title="Source code"
          subtitle="github.com/tashifkhan/Patchwork"
          trailing={external}
          onPress={() => open(REPO)}
        />
        <RowSeparator />
        <SettingsRow
          icon="new-box"
          sf="sparkles.rectangle.stack"
          title="What's new"
          subtitle="Every release, in the changelog"
          trailing={external}
          onPress={() => open(`${REPO}/blob/main/CHANGELOG.md`)}
        />
        <RowSeparator />
        <SettingsRow
          icon="handshake-outline"
          sf="hands.clap"
          title="Third-party notices"
          subtitle="The clock faces and press springs come from Expressive Clock"
          trailing={external}
          onPress={() => open(`${REPO}/blob/main/THIRD-PARTY-NOTICES.md`)}
        />
      </SettingsGroup>

      <Text style={{ fontSize: 13, lineHeight: 18, color: colors.text3, textAlign: 'center', paddingHorizontal: 24 }}>
        Made with Expo and React Native.
      </Text>
    </SettingsScreen>
  );
}

/**
 * Patch, the name and the version. Android: a tonal hero card, like Paisa's.
 * iOS: centered on the grouped background, like the system's About pages.
 * Tapping Patch tries on another mood.
 */
function Identity() {
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const version = Constants.expoConfig?.version ?? '1.0.0';
  const name = Constants.expoConfig?.name ?? 'Patchwork';
  const platform = IOS ? (Platform.isPad ? 'iPadOS' : 'iOS') : 'Android';
  const ink = IOS ? colors.text : colors.onPrimaryContainer;

  const mascot = (
    <Pressable
      onPress={() => {
        haptics.impact('light');
        setIndex((i) => (i + 1) % MOODS.length);
      }}
      accessibilityRole="button"
      accessibilityLabel="Patch, the Patchwork mascot. Tap for another pose.">
      {/* Remount on each mood so the new pose pops in. */}
      <Animated.View key={index} entering={ZoomIn.springify().damping(12).stiffness(260)}>
        <PatchMascot mood={MOODS[index]} size={IOS ? 150 : 120} interactive={false} />
      </Animated.View>
    </Pressable>
  );

  const text = (
    <View style={{ gap: 4, alignItems: IOS ? 'center' : 'flex-start' }}>
      <Text style={{ fontSize: IOS ? 28 : 26, fontWeight: '800', letterSpacing: -0.5, color: ink }}>{name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View
          style={{
            paddingHorizontal: 10,
            height: 24,
            borderRadius: 12,
            justifyContent: 'center',
            backgroundColor: IOS ? colors.bg3 : withAlpha('#FFFFFF', 0.14),
          }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: ink, fontVariant: ['tabular-nums'] }}>
            v{version}
          </Text>
        </View>
        <Text style={{ fontSize: 14, color: withAlpha(ink, 0.7) }}>{platform}</Text>
      </View>
      <Text
        style={{
          fontSize: 15,
          lineHeight: 21,
          marginTop: 4,
          color: withAlpha(ink, 0.8),
          textAlign: IOS ? 'center' : 'left',
          maxWidth: 320,
        }}>
        To-dos, boards and focus time, stitched into one app from the servers you already use.
      </Text>
    </View>
  );

  if (IOS) {
    return (
      <RiseIn style={{ alignItems: 'center', gap: 8, paddingTop: 8 }}>
        {mascot}
        {text}
      </RiseIn>
    );
  }

  return (
    <RiseIn>
      <View
        style={{
          borderRadius: 32,
          borderCurve: 'continuous',
          backgroundColor: colors.primaryContainer,
          padding: 20,
          gap: 12,
        }}>
        <View style={{ alignSelf: 'center' }}>{mascot}</View>
        {text}
      </View>
    </RiseIn>
  );
}
