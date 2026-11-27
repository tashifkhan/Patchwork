import { MaterialCommunityIcons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, TextInput, useWindowDimensions } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeIn, SlideInDown, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme/context';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { RiseIn } from '@/components/ui/motion';
import { sheetOverlayStyle, useSheetPanel } from '@/components/ui/sheet-panel';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';
import { listTone } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { ScrollView, Text, View } from '@/tw';

export interface PickerSheetItem {
  key: string;
  label: string;
  subtitle?: string;
  leading?: ReactNode;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  selected?: boolean;
  /** Short count or state shown as a chip on the stacked card ("12 cards"). */
  badge?: string;
  onPress: () => void;
}

export interface PickerSheetSearch {
  placeholder?: string;
  /**
   * Set to search somewhere else (Jira's user search): the sheet shows
   * `items` as given and reports what was typed. Left out, the sheet filters
   * `items` by label and subtitle itself.
   */
  onChange?: (query: string) => void;
  /** Results are on their way. */
  loading?: boolean;
  /** Shown when nothing matches. */
  emptyText?: string;
}

/**
 * Material 3 bottom sheet with one row per choice: used to switch boards and
 * to move a card to another column. With `search`, a field at the top narrows
 * the choices, and the sheet rides above the keyboard.
 */
export function PickerSheet({
  visible,
  title,
  subtitle,
  items,
  onClose,
  layout = 'rows',
  search,
  doneLabel,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  items: PickerSheetItem[];
  onClose: () => void;
  /**
   * `stack`: on Android, the choices are a fanned stack of tonal cards like My
   * lists and the Boards tab. iOS keeps plain rows either way.
   */
  layout?: 'rows' | 'stack';
  search?: PickerSheetSearch;
  /** A button in the header that closes the sheet, for picking several things. */
  doneLabel?: string;
}) {
  const { colors } = useTheme();
  const stacked = layout === 'stack' && Platform.OS === 'android' && !search;
  const panel = useSheetPanel(12);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { height: keyboard } = useReanimatedKeyboardAnimation();
  // `keyboard` is negative while it is up. The sheet sits on top of it and
  // never grows past the status bar.
  const lift = useAnimatedStyle(() => ({ paddingBottom: -keyboard.value }));
  const cap = useAnimatedStyle(() => ({
    maxHeight: Math.min(windowHeight * 0.8, windowHeight + keyboard.value - insets.top - 24),
  }));

  const needle = query.trim().toLowerCase();
  const shown =
    search && !search.onChange && needle
      ? items.filter((item) => `${item.label} ${item.subtitle ?? ''}`.toLowerCase().includes(needle))
      : items;
  function close() {
    setQuery('');
    search?.onChange?.('');
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
      // Each opening starts with an empty search, however the last one closed.
      onShow={() => {
        setQuery('');
        search?.onChange?.('');
      }}>
      <Animated.View entering={FadeIn.duration(DURATION.short4)} style={sheetOverlayStyle()}>
        <AnimatedPressable
          onPress={close}
          accessibilityLabel="Close"
          style={[{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }, search ? lift : null]}>
          <Animated.View
            entering={SlideInDown.duration(DURATION.medium4).easing(EASING.emphasizedDecelerate)}
            onStartShouldSetResponder={() => true}
            style={[
              {
                ...panel.style,
                maxHeight: '80%',
              },
              search ? cap : null,
            ]}>
            {panel.background}
            <View className="items-center" style={{ paddingTop: 16, paddingBottom: 8 }}>
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.gray }} />
            </View>
            <View className="px-6 pb-2" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ fontSize: 22, fontWeight: '600', color: colors.text }}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text numberOfLines={2} style={{ fontSize: 14, color: colors.text2, marginTop: 2 }}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
              {doneLabel ? (
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    close();
                  }}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => ({
                    height: 36,
                    paddingHorizontal: 16,
                    borderRadius: pressed ? 10 : 18,
                    justifyContent: 'center',
                    backgroundColor: colors.accent,
                  })}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.onAccent }}>{doneLabel}</Text>
                </Pressable>
              ) : null}
            </View>
            {search ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    height: 48,
                    borderRadius: 24,
                    paddingHorizontal: 16,
                    backgroundColor: Platform.OS === 'android' ? colors.surfaceContainerHighest : colors.bg3,
                  }}>
                  <MaterialCommunityIcons name="magnify" size={22} color={colors.text2} />
                  <TextInput
                    value={query}
                    onChangeText={(value) => {
                      setQuery(value);
                      search.onChange?.(value);
                    }}
                    placeholder={search.placeholder ?? 'Search'}
                    placeholderTextColor={colors.text3}
                    accessibilityLabel={search.placeholder ?? 'Search'}
                    autoCorrect={false}
                    autoCapitalize="none"
                    returnKeyType="search"
                    style={{ flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 }}
                  />
                  {search.loading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : query ? (
                    <Pressable
                      onPress={() => {
                        setQuery('');
                        search.onChange?.('');
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Clear search">
                      <MaterialCommunityIcons name="close-circle" size={20} color={colors.text3} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}
            {stacked ? (
              <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}>
                {shown.map((item, index) => (
                  <RiseIn
                    key={item.key}
                    index={index}
                    rise={36}
                    fromScale={0.94}
                    style={{ marginTop: index === 0 ? 0 : -STACK_OVERLAP, zIndex: index }}>
                    <StackCard item={item} index={index} last={index === shown.length - 1} />
                  </RiseIn>
                ))}
              </ScrollView>
            ) : (
            <ScrollView
              style={{ flexGrow: 0 }}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4 }}>
              {search && shown.length === 0 ? (
                <Text style={{ fontSize: 15, color: colors.text2, paddingHorizontal: 12, paddingVertical: 20 }}>
                  {search.loading ? 'Searching…' : (search.emptyText ?? 'Nothing matches.')}
                </Text>
              ) : null}
              {shown.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => {
                    haptics.selection();
                    item.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: !!item.selected }}
                  android_ripple={{ color: colors.separator }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 16,
                    minHeight: 56,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 28,
                    overflow: 'hidden',
                    backgroundColor: item.selected ? colors.selectionBg : 'transparent',
                    opacity: pressed && Platform.OS === 'ios' ? 0.7 : 1,
                  })}>
                  {item.leading ??
                    (item.icon ? (
                      <View style={{ width: 40, alignItems: 'center' }}>
                        <MaterialCommunityIcons name={item.icon} size={22} color={colors.text2} />
                      </View>
                    ) : null)}
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 16,
                        fontWeight: item.selected ? '600' : '400',
                        color: item.selected ? colors.onSelectionBg : colors.text,
                      }}>
                      {item.label}
                    </Text>
                    {item.subtitle ? (
                      <Text numberOfLines={1} style={{ fontSize: 13, color: colors.text2 }}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {item.selected ? (
                    <MaterialCommunityIcons name="check" size={22} color={colors.onSelectionBg} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
            )}
          </Animated.View>
        </AnimatedPressable>
      </Animated.View>
    </Modal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const STACK_HEIGHT = 128;
/** How much of each card the next one covers, as in My lists. */
const STACK_OVERLAP = 34;
const STACK_RADIUS = 32;

/** One choice as a tonal card in the fanned stack (Android). */
function StackCard({ item, index, last }: { item: PickerSheetItem; index: number; last: boolean }) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { fill, ink } = listTone(colors, dark, index);
  const press = useElasticPress({ maxStretch: 0.015, maxTranslate: 1.5, pressedScale: 0.97, releaseOnDrag: true });
  // The arrow leans out toward its corner while the card is held.
  const arrow = useAnimatedStyle(() => ({
    transform: [
      { translateX: 4 * press.glow.value },
      { translateY: -4 * press.glow.value },
      { scale: 1 + 0.12 * press.glow.value },
    ],
  }));
  const chip = withAlpha('#FFFFFF', dark ? 0.12 : 0.62);
  const badge = item.selected ? 'Current' : item.badge;

  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.selection();
          item.onPress();
        }}
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityState={{ selected: !!item.selected }}
        accessibilityLabel={[item.label, item.subtitle, item.badge].filter(Boolean).join(', ')}
        style={{
          height: last ? STACK_HEIGHT - STACK_OVERLAP + 12 : STACK_HEIGHT,
          borderRadius: STACK_RADIUS,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: fill,
          paddingHorizontal: 22,
          paddingTop: 18,
          boxShadow: index === 0 ? undefined : `0 -6px 18px ${withAlpha('#000000', dark ? 0.4 : 0.1)}`,
        }}>
        <PressGlow press={press} color={withAlpha(ink, dark ? 0.12 : 0.1)} radius={STACK_RADIUS} size={60} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {item.leading ??
            (item.icon ? <MaterialCommunityIcons name={item.icon} size={24} color={ink} /> : null)}
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 22, fontWeight: '600', color: ink }}>
            {item.label}
          </Text>
          {badge ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                height: 32,
                paddingHorizontal: 12,
                borderRadius: 16,
                backgroundColor: chip,
              }}>
              {item.selected ? <MaterialCommunityIcons name="check" size={16} color={ink} /> : null}
              <Text style={{ fontSize: 13, fontWeight: '600', color: ink }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: withAlpha(ink, 0.78) }}>
            {item.subtitle ?? ''}
          </Text>
          <Animated.View style={arrow}>
            <MaterialCommunityIcons name="arrow-top-right" size={26} color={ink} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
