import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, Pressable } from 'react-native';
import { useState } from 'react';

import { SettingsGroup, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
  const { colors, scheme } = useTheme();
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
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const colorPalette = useSettingsStore((s) => s.colorPalette);
  const setColorPalette = useSettingsStore((s) => s.setColorPalette);

  const isAndroid = Platform.OS === 'android';
  const [showAllPalettes, setShowAllPalettes] = useState(() => {
    if (!colorPalette) return false;
    const idx = COLOR_PALETTES.findIndex((p) => p.id === colorPalette);
    return idx >= FEATURED_COUNT;
  });

  const visiblePalettes = showAllPalettes ? COLOR_PALETTES : COLOR_PALETTES.slice(0, FEATURED_COUNT);
  const hiddenCount = COLOR_PALETTES.length - FEATURED_COUNT;

  return (
    <SettingsScreen>
      {/* Theme mode cards — Paisa-style segmented choice */}
      <View className="flex-row gap-2">
        {THEME_MODES.map((mode) => {
          const selected = themeMode === mode.id;
          return (
            <Pressable
              key={mode.id}
              onPress={() => setThemeMode(mode.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}>
              <View
                className="items-center justify-center gap-1.5 rounded-3xl py-4"
                style={{
                  minHeight: 72,
                  backgroundColor: selected ? colors.primaryContainer : colors.bg2,
                  borderCurve: 'continuous',
                  borderWidth: selected ? 1.5 : 0,
                  borderColor: selected ? colors.accent : 'transparent',
                }}>
                <MaterialCommunityIcons
                  name={mode.icon}
                  size={22}
                  color={selected ? colors.onPrimaryContainer : colors.text2}
                />
                <Text
                  className="text-sm font-semibold"
                  style={{ color: selected ? colors.onPrimaryContainer : colors.text }}>
                  {mode.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Color palettes */}
      <View className="gap-2">
        <Text
          className="px-1 text-xs font-semibold uppercase tracking-wide"
          style={{ color: colors.accent }}>
          Color palette
        </Text>
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

      {/* Display options */}
      <SettingsGroup title="Display">
        {isAndroid ? (
          <>
            <ToggleRow
              icon="palette-swatch"
              label="Wallpaper colors"
              subtitle="Material You palette from your wallpaper"
              value={dynamicColor}
              onValueChange={(v) => {
                setDynamicColor(v);
                if (v) setColorPalette(null);
              }}
            />
            <View className="bg-sf-separator ml-4 h-px" />
          </>
        ) : null}
        <ToggleRow
          icon="circle-opacity"
          label="AMOLED black"
          subtitle={
            scheme === 'dark'
              ? 'Pure black surfaces for OLED displays'
              : 'Applies in dark mode only'
          }
          value={pureBlack}
          onValueChange={setPureBlack}
        />
        <View className="bg-sf-separator ml-4 h-px" />
        <ToggleRow
          icon="contrast-circle"
          label="High contrast"
          subtitle="Stronger text and outlines for readability"
          value={highContrast}
          onValueChange={setHighContrast}
        />
        <View className="bg-sf-separator ml-4 h-px" />
        <ToggleRow
          icon="vibrate"
          label="Haptic feedback"
          subtitle="Vibrate on taps, toggles and drags"
          value={hapticsEnabled}
          onValueChange={setHapticsEnabled}
        />
        {isAndroid ? (
          <>
            <View className="bg-sf-separator ml-4 h-px" />
            <ToggleRow
              icon="dock-bottom"
              label="Floating tab bar"
              subtitle="iOS-style pill bar above the bottom edge"
              value={floatingTabBar}
              onValueChange={setFloatingTabBar}
            />
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
          backgroundColor: selected ? colors.primaryContainer : colors.bg2,
          borderCurve: 'continuous',
          borderWidth: selected ? 1.5 : 1,
          borderColor: selected ? colors.accent : colors.separator,
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
              borderColor: selected ? colors.primaryContainer : colors.bg2,
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

function ToggleRow({
  icon,
  label,
  subtitle,
  value,
  onValueChange,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={({ pressed }) => ({
        opacity: pressed ? 0.85 : 1,
        minHeight: 64,
      })}>
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <View
          className="h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.primaryContainer }}>
          <MaterialCommunityIcons name={icon} size={22} color={colors.onPrimaryContainer} />
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold" style={{ color: colors.text }}>
            {label}
          </Text>
          {subtitle ? (
            <Text className="mt-0.5 text-xs" style={{ color: colors.text2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Switch value={value} onValueChange={onValueChange} />
      </View>
    </Pressable>
  );
}
