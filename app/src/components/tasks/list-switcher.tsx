import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Dimensions, Modal, Platform, Pressable } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import type { TaskList } from '@/api/types';
import type { GitHubRepositorySelection } from '@/features/github/types';
import { useTheme } from '@/components/theme/context';
import { useSheetPanel } from '@/components/ui/sheet-panel';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';
import { ScrollView, Text, View } from '@/tw';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * The Tasks screen's title. Things puts the list name front and centre as the
 * page title; tapping it here opens the list switcher sheet.
 */
export function ListHero({
  title,
  subtitle,
  onPress,
  kind = 'all',
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  /** iOS shows a Things-style glyph before the title for each kind of list. */
  kind?: 'all' | 'list' | 'repo';
}) {
  const { colors } = useTheme();
  if (Platform.OS === 'ios') {
    const glyph: Record<typeof kind, { sf: SFSymbol; color: string }> = {
      all: { sf: 'tray.full.fill', color: colors.accent },
      list: { sf: 'list.bullet.circle.fill', color: colors.accent },
      repo: { sf: 'chevron.left.forwardslash.chevron.right', color: colors.text },
    };
    return (
      <Pressable
        onPress={() => {
          haptics.tap();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title}. Switch list`}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start', maxWidth: '100%' })}>
        <View className="flex-row items-center" style={{ gap: 10 }}>
          <SymbolView name={glyph[kind].sf} size={28} tintColor={glyph[kind].color} />
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.4, color: colors.text }}>
            {title}
          </Text>
          <SymbolView name="chevron.down" size={15} weight="semibold" tintColor={colors.text3} />
        </View>
        <Text style={{ fontSize: 15, color: colors.text2, marginTop: 2, marginLeft: 38 }}>{subtitle}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}. Switch list`}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start' })}>
      <View className="flex-row items-center gap-1.5">
        <Text
          numberOfLines={1}
          style={{ fontSize: 32, lineHeight: 40, fontWeight: '700', letterSpacing: -0.5, color: colors.text }}>
          {title}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={26} color={colors.text2} />
      </View>
      <Text style={{ fontSize: 14, color: colors.text2, marginTop: 2 }}>{subtitle}</Text>
    </Pressable>
  );
}

/**
 * Material 3 bottom sheet for switching lists. Each list shows its open
 * count, the current one gets a filled accent icon, and list management
 * (new / edit) sits below a divider.
 */
export function ListSwitcherSheet({
  visible,
  lists,
  repos = [],
  repoCounts = {},
  counts,
  totalCount,
  selectedListId,
  onSelect,
  onCreate,
  onEdit,
  onClose,
}: {
  visible: boolean;
  lists: TaskList[];
  /** Followed GitHub repositories, listed as `gh:<owner/repo>` lists. */
  repos?: GitHubRepositorySelection[];
  /** Open issues per repository, keyed by lowercased full name. */
  repoCounts?: Record<string, number>;
  counts: Record<string, number>;
  totalCount: number;
  selectedListId: string | null;
  onSelect: (listId: string | null) => void;
  onCreate: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const panel = useSheetPanel(12);
  const accounts = [...new Set(lists.map((l) => l.account_name).filter(Boolean))];
  const grouped = accounts.length > 1;
  const selected = lists.find((l) => l.id === selectedListId) ?? null;

  function pick(id: string | null) {
    haptics.selection();
    onSelect(id);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/*
        Android lays the modal's root out at the old window size (above the
        navigation bar) and only learns the full edge-to-edge size a few
        frames later, so a `flex: 1` sheet would park above the tab bar and
        then drop. Sizing the overlay to the physical screen up front pins the
        sheet to the bottom edge from the first frame.
      */}
      <Animated.View
        entering={FadeIn.duration(DURATION.short4)}
        style={
          Platform.OS === 'android'
            ? {
                position: 'absolute',
                top: 0,
                left: 0,
                width: Dimensions.get('screen').width,
                height: Dimensions.get('screen').height,
              }
            : { flex: 1 }
        }>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close list switcher"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }}>
          <Animated.View
            // M3 sheet enter: emphasized-decelerate slide, no spring. A
            // spring overshoots past the resting point and then drops back,
            // which reads as the sheet getting stuck before it settles.
            entering={SlideInDown.duration(DURATION.medium4).easing(EASING.emphasizedDecelerate)}
            onStartShouldSetResponder={() => true}
            style={{
              ...panel.style,
              maxHeight: '80%',
            }}>
            {panel.background}
            {/* Drag handle: M3 on Android, the iOS grabber on iOS */}
            <View className="items-center" style={{ paddingTop: Platform.OS === 'ios' ? 8 : 16, paddingBottom: 8 }}>
              <View
                style={
                  Platform.OS === 'ios'
                    ? { width: 36, height: 5, borderRadius: 2.5, backgroundColor: colors.gray3 }
                    : { width: 32, height: 4, borderRadius: 2, backgroundColor: colors.gray }
                }
              />
            </View>
            <Text
              className="text-sf-text px-6 pb-2"
              style={
                Platform.OS === 'ios'
                  ? { fontSize: 20, fontWeight: '700', letterSpacing: 0.4, paddingTop: 4 }
                  : { fontSize: 22, fontWeight: '600' }
              }>
              Lists
            </Text>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12 }}>
              <SheetRow
                icon="tray-full"
                label="All tasks"
                count={totalCount}
                selected={selectedListId == null}
                onPress={() => pick(null)}
              />
              {(grouped ? accounts : [undefined]).map((account) => (
                <View key={account ?? 'all'}>
                  {grouped ? (
                    <Text
                      className="px-4 pb-1 pt-4"
                      style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
                      {account}
                    </Text>
                  ) : null}
                  {lists
                    .filter((l) => !grouped || l.account_name === account)
                    .map((list) => (
                      <SheetRow
                        key={list.id}
                        icon="format-list-bulleted"
                        label={list.name}
                        count={counts[list.id] ?? 0}
                        selected={list.id === selectedListId}
                        onPress={() => pick(list.id)}
                      />
                    ))}
                </View>
              ))}
              {repos.length > 0 ? (
                <View>
                  <Text
                    className="px-4 pb-1 pt-4"
                    style={{ fontSize: 14, fontWeight: '600', color: colors.accent }}>
                    GitHub
                  </Text>
                  {repos.map((repo) => (
                    <SheetRow
                      key={repo.fullName}
                      icon="github"
                      label={repo.fullName.split('/')[1] ?? repo.fullName}
                      count={repoCounts[repo.fullName.toLowerCase()] ?? 0}
                      selected={selectedListId === `gh:${repo.fullName}`}
                      onPress={() => pick(`gh:${repo.fullName}`)}
                    />
                  ))}
                </View>
              ) : null}
              <View style={{ height: 1, backgroundColor: colors.separator, marginVertical: 8, marginHorizontal: 12 }} />
              <SheetRow
                icon="plus"
                label="New list"
                plain
                onPress={() => {
                  onClose();
                  onCreate();
                }}
              />
              {selected ? (
                <SheetRow
                  icon="pencil-outline"
                  label={`Edit "${selected.name}"`}
                  plain
                  onPress={() => {
                    onClose();
                    onEdit();
                  }}
                />
              ) : null}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function SheetRow({
  icon,
  label,
  count,
  selected,
  plain,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  selected?: boolean;
  plain?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  if (Platform.OS === 'ios') {
    // Plain iOS list row: SF glyph, name, gray count, checkmark on the current list.
    const sf: Partial<Record<IconName, SFSymbol>> = {
      'tray-full': 'tray.full.fill',
      'format-list-bulleted': 'list.bullet',
      github: 'chevron.left.forwardslash.chevron.right',
      plus: 'plus',
      'pencil-outline': 'pencil',
    };
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={count != null ? `${label}, ${count} open` : label}
        accessibilityState={{ selected: !!selected }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          minHeight: 50,
          paddingHorizontal: 12,
          borderRadius: 14,
          backgroundColor: pressed ? colors.separator : 'transparent',
        })}>
        <View style={{ width: 28, alignItems: 'center' }}>
          {sf[icon] ? (
            <SymbolView name={sf[icon]!} size={20} tintColor={colors.accent} />
          ) : (
            <MaterialCommunityIcons name={icon} size={20} color={colors.accent} />
          )}
        </View>
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 17,
            letterSpacing: -0.4,
            fontWeight: selected ? '600' : '400',
            color: plain ? colors.accent : colors.text,
          }}>
          {label}
        </Text>
        {count != null ? (
          <Text style={{ fontSize: 17, color: colors.text3, fontVariant: ['tabular-nums'] }}>{count}</Text>
        ) : null}
        {selected ? <SymbolView name="checkmark" size={16} weight="semibold" tintColor={colors.accent} /> : null}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count != null ? `${label}, ${count} open` : label}
      accessibilityState={{ selected: !!selected }}
      android_ripple={{ color: colors.separator }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        minHeight: 56,
        paddingHorizontal: 12,
        borderRadius: 28,
        overflow: 'hidden',
        // M3 navigation-drawer style active indicator.
        backgroundColor: selected ? colors.selectionBg : 'transparent',
        opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1,
      })}>
      {plain ? (
        <View style={{ width: 40, alignItems: 'center' }}>
          <MaterialCommunityIcons name={icon} size={22} color={colors.accent} />
        </View>
      ) : (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: selected ? 12 : 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? colors.accent : colors.primaryContainer,
          }}>
          <MaterialCommunityIcons
            name={icon}
            size={20}
            color={selected ? colors.onAccent : colors.onPrimaryContainer}
          />
        </View>
      )}
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 16,
          fontWeight: selected ? '600' : '400',
          color: plain ? colors.accent : selected ? colors.onSelectionBg : colors.text,
        }}>
        {label}
      </Text>
      {count != null ? (
        <Text
          style={{
            fontSize: 14,
            color: selected ? colors.onSelectionBg : colors.text2,
            fontVariant: ['tabular-nums'],
          }}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}
