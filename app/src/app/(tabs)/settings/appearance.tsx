import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { Fragment, useState } from 'react';
import { Platform, Pressable } from 'react-native';

import {
  RowSeparator,
  SettingsCell,
  SettingsActionRow,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
  SettingsSectionHeader,
  SettingsToggleRow,
  useSettingsColors,
} from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { SegmentedChoice } from '@/components/ui/segmented-choice';
import { COLOR_PALETTES } from '@/lib/palettes';
import { useSettingsStore, type ThemeMode } from '@/stores/settings-store';
import { Text, View } from '@/tw';

const THEME_MODES: {
  id: ThemeMode;
  label: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}[] = [
  { id: 'system', label: 'System', icon: 'theme-light-dark' },
  { id: 'light', label: 'Light', icon: 'white-balance-sunny' },
  { id: 'dark', label: 'Dark', icon: 'moon-waning-crescent' },
];

const FEATURED_COUNT = 4;

/** Fixed swatch for the System / Wallpaper option so it never mirrors the active palette. */
const SYSTEM_SEED = Platform.OS === 'android' ? '#6750A4' : '#007AFF';

export default function AppearanceScreen() {
  const { scheme } = useTheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const dynamicColor = useSettingsStore((s) => s.dynamicColor);
  const setDynamicColor = useSettingsStore((s) => s.setDynamicColor);
  const pureBlack = useSettingsStore((s) => s.pureBlack);
  const setPureBlack = useSettingsStore((s) => s.setPureBlack);
  const highContrast = useSettingsStore((s) => s.highContrast);
  const setHighContrast = useSettingsStore((s) => s.setHighContrast);
  const floatingTabBar = useSettingsStore((s) => s.floatingTabBar);
  const setFloatingTabBar = useSettingsStore((s) => s.setFloatingTabBar);
  const tabBarLabels = useSettingsStore((s) => s.tabBarLabels);
  const setTabBarLabels = useSettingsStore((s) => s.setTabBarLabels);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const colorPalette = useSettingsStore((s) => s.colorPalette);
  const setColorPalette = useSettingsStore((s) => s.setColorPalette);

  const isAndroid = Platform.OS === 'android';
  const isIOS = Platform.OS === 'ios';
  const [showAllPalettes, setShowAllPalettes] = useState(() => {
    if (!colorPalette) return false;
    const idx = COLOR_PALETTES.findIndex((p) => p.id === colorPalette);
    return idx >= FEATURED_COUNT;
  });

  const visiblePalettes = showAllPalettes ? COLOR_PALETTES : COLOR_PALETTES.slice(0, FEATURED_COUNT);
  const hiddenCount = COLOR_PALETTES.length - FEATURED_COUNT;

  return (
    <SettingsScreen>
      {isIOS ? (
        <>
          {/* Display & Brightness–style appearance picker. */}
          <SettingsGroup title="Appearance">
            <AppearancePicker value={themeMode} onChange={setThemeMode} />
          </SettingsGroup>

          {/* Accent colors as a checkmark list, the way iOS lists choices. */}
          <SettingsGroup
            title="Accent color"
            footer="Tints buttons, switches, icons and selections across the app.">
            <SettingsRow
              leading={<Swatch color={SYSTEM_SEED} />}
              title="System Blue"
              selected={!colorPalette && !accentColor}
              onPress={() => {
                setColorPalette(null);
                setAccentColor(null);
              }}
            />
            {visiblePalettes.map((palette) => (
              <Fragment key={palette.id}>
                <RowSeparator />
                <SettingsRow
                  leading={<Swatch color={palette.seed} />}
                  title={palette.label}
                  selected={colorPalette === palette.id}
                  onPress={() => setColorPalette(palette.id)}
                />
              </Fragment>
            ))}
            {hiddenCount > 0 ? (
              <>
                <RowSeparator />
                <SettingsActionRow
                  title={showAllPalettes ? 'Show Fewer Colors' : `Show All Colors (${COLOR_PALETTES.length})`}
                  onPress={() => setShowAllPalettes((v) => !v)}
                />
              </>
            ) : null}
          </SettingsGroup>
        </>
      ) : (
        <>
        {/* Native exclusive choice: UISegmentedControl (Liquid Glass on iOS 26)
            and Compose SingleChoiceSegmentedButtonRow on Android. */}
        <SettingsGroup title="Theme">
          <SettingsCell>
            <SegmentedChoice
              options={THEME_MODES.map((mode) => ({ label: mode.label, value: mode.id }))}
              value={themeMode}
              onChange={setThemeMode}
            />
          </SettingsCell>
        </SettingsGroup>

        {/* Color palettes */}
        <View className="gap-2">
          <SettingsSectionHeader title="Color palette" />
          <View className="flex-row flex-wrap gap-2">
            <PaletteCard
              label={isAndroid ? 'Wallpaper' : 'System'}
              subtitle={isAndroid ? 'Material You' : 'Default blue'}
              seed={SYSTEM_SEED}
              selected={!colorPalette && (isAndroid ? dynamicColor : !accentColor)}
              onPress={() => {
                setColorPalette(null);
                setAccentColor(null);
                if (isAndroid) setDynamicColor(true);
              }}
            />
            {visiblePalettes.map((palette) => (
              <PaletteCard
                key={palette.id}
                label={palette.label}
                subtitle="Fixed palette"
                seed={palette.seed}
                selected={colorPalette === palette.id}
                onPress={() => setColorPalette(palette.id)}
              />
            ))}
          </View>
          {hiddenCount > 0 ? (
            <Button
              variant="tonal"
              label={showAllPalettes ? 'Show less' : `Show more · ${hiddenCount} themes`}
              icon={showAllPalettes ? 'chevron-up' : 'chevron-down'}
              onPress={() => setShowAllPalettes((v) => !v)}
            />
          ) : null}
        </View>
        </>
      )}

      {/* Display options */}
      <SettingsGroup title="Display">
        {isAndroid ? (
          <>
            <SettingsToggleRow
              icon="palette-swatch"
              title="Wallpaper colors"
              subtitle="Material You palette from your wallpaper"
              value={dynamicColor}
              onValueChange={(v) => {
                setDynamicColor(v);
                if (v) setColorPalette(null);
              }}
            />
            <RowSeparator />
          </>
        ) : null}
        <SettingsToggleRow
          icon="circle-opacity"
          title="AMOLED black"
          subtitle={
            scheme === 'dark'
              ? 'Pure black surfaces for OLED displays'
              : 'Applies in dark mode only'
          }
          value={pureBlack}
          onValueChange={setPureBlack}
        />
        <RowSeparator />
        <SettingsToggleRow
          icon="contrast-circle"
          title="High contrast"
          subtitle="Stronger text and outlines for readability"
          value={highContrast}
          onValueChange={setHighContrast}
        />
        <RowSeparator />
        <SettingsToggleRow
          icon="vibrate"
          title="Haptic feedback"
          subtitle="Vibrate on taps, toggles and drags"
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
        />
        {isAndroid ? (
          <>
            <RowSeparator />
            <SettingsToggleRow
              icon="dock-bottom"
              title="Floating navbar"
              subtitle="Pill-shaped bar that floats above the bottom edge"
              value={floatingTabBar}
              onValueChange={setFloatingTabBar}
            />
            {!floatingTabBar ? (
              <>
                <RowSeparator />
                <SettingsToggleRow
                  icon="label-outline"
                  title="Navbar labels"
                  subtitle="Show a label under every tab, not just the selected one"
                  value={tabBarLabels}
                  onValueChange={setTabBarLabels}
                />
              </>
            ) : null}
          </>
        ) : null}
      </SettingsGroup>
    </SettingsScreen>
  );
}

function PaletteCard({
  label,
  subtitle,
  seed,
  selected,
  onPress,
}: {
  label: string;
  subtitle: string;
  seed: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const { cell } = useSettingsColors();
  const checkColor = isLightSeed(seed) ? '#1C1B1F' : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        width: '48%' as const,
        flexGrow: 1,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View
        className="items-center rounded-3xl px-3 py-5"
        style={{
          minHeight: 110,
          // Soft theme container when selected — never flood with raw seed @ 40%.
          backgroundColor: selected ? colors.primaryContainer : cell,
          borderCurve: 'continuous',
          borderWidth: selected ? 1.5 : 0,
          borderColor: selected ? colors.accent : 'transparent',
        }}>
        <Text
          className="text-base font-bold"
          style={{ color: selected ? colors.onPrimaryContainer : colors.text }}>
          {label}
        </Text>
        <Text
          className="mt-0.5 text-xs"
          style={{ color: selected ? colors.onPrimaryContainer : colors.text2 }}>
          {subtitle}
        </Text>
        {/* Outer ring uses accent when selected; inner disc is the fixed seed swatch. */}
        <View
          className="mt-3 items-center justify-center rounded-full"
          style={{
            padding: selected ? 2 : 0,
            backgroundColor: selected ? colors.accent : 'transparent',
          }}>
          <View
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{
              backgroundColor: seed,
              borderWidth: 2,
              borderColor: selected ? colors.primaryContainer : cell,
            }}>
            {selected ? (
              <MaterialCommunityIcons name="check" size={14} color={checkColor} />
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function isLightSeed(hex: string): boolean {
  const raw = hex.replace('#', '').slice(0, 6);
  if (raw.length !== 6) return false;
  const n = Number.parseInt(raw, 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.65;
}

/** Round color chip used as the leading element of an accent row. */
function Swatch({ color }: { color: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: color,
        borderWidth: 1,
        borderColor: colors.separator,
      }}
    />
  );
}

const PREVIEW_W = 70;
const PREVIEW_H = 132;

/** A tiny phone screen in light or dark, for the appearance picker. */
function ScreenPreview({ dark }: { dark: boolean }) {
  const bg = dark ? '#000000' : '#F2F2F7';
  const card = dark ? '#1C1C1E' : '#FFFFFF';
  const ink = dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.8)';
  return (
    <View style={{ width: PREVIEW_W, height: PREVIEW_H, backgroundColor: bg, padding: 7, gap: 5 }}>
      <View style={{ height: 4 }} />
      <View style={{ width: '55%', height: 6, borderRadius: 3, backgroundColor: ink }} />
      {[22, 34, 16].map((h, i) => (
        <View key={i} style={{ height: h, borderRadius: 6, backgroundColor: card }} />
      ))}
    </View>
  );
}

/** Light / Dark / System picker modeled on Settings > Display & Brightness. */
function AppearancePicker({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row justify-around" style={{ paddingTop: 20, paddingBottom: 16 }}>
      {THEME_MODES.map((mode) => {
        const selected = value === mode.id;
        return (
          <Pressable
            key={mode.id}
            onPress={() => onChange(mode.id)}
            accessibilityRole="radio"
            accessibilityLabel={mode.label}
            accessibilityState={{ selected }}
            style={({ pressed }) => ({ alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
            <View
              style={{
                width: PREVIEW_W,
                height: PREVIEW_H,
                borderRadius: 14,
                borderCurve: 'continuous',
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: colors.separator,
                flexDirection: 'row',
              }}>
              {mode.id === 'system' ? (
                <>
                  <View style={{ width: PREVIEW_W / 2, overflow: 'hidden' }}>
                    <ScreenPreview dark={false} />
                  </View>
                  <View style={{ width: PREVIEW_W / 2, overflow: 'hidden' }}>
                    <View style={{ marginLeft: -PREVIEW_W / 2 }}>
                      <ScreenPreview dark />
                    </View>
                  </View>
                </>
              ) : (
                <ScreenPreview dark={mode.id === 'dark'} />
              )}
            </View>
            <Text style={{ fontSize: 15, color: colors.text }}>{mode.label}</Text>
            <SymbolView
              name={selected ? 'checkmark.circle.fill' : 'circle'}
              size={22}
              tintColor={selected ? colors.accent : colors.text3}
              weight="regular"
            />
          </Pressable>
        );
      })}
    </View>
  );
}
