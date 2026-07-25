import { SegmentedControl } from '@expo/ui/community/segmented-control';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, Pressable } from 'react-native';

import { SettingsGroup, SettingsScreen } from '@/components/settings/settings-list';
import { useTheme } from '@/components/theme/context';
import { Switch } from '@/components/ui/switch';
import { useSettingsStore, type ThemeMode } from '@/stores/settings-store';
import { Text, View } from '@/tw';

const THEME_OPTIONS: ThemeMode[] = ['system', 'light', 'dark'];
const THEME_LABELS = ['System', 'Light', 'Dark'];
const ACCENT_PRESETS = ['#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#FF9F0A', '#30D158'];

export default function AppearanceScreen() {
  const { colors, scheme } = useTheme();
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const dynamicColor = useSettingsStore((s) => s.dynamicColor);
  const setDynamicColor = useSettingsStore((s) => s.setDynamicColor);
  const pureBlack = useSettingsStore((s) => s.pureBlack);
  const setPureBlack = useSettingsStore((s) => s.setPureBlack);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);

  const isAndroid = Platform.OS === 'android';
  const accentDisabled = isAndroid && dynamicColor;

  return (
    <SettingsScreen>
      <SettingsGroup title="Theme">
        <View className="gap-2.5 px-4 py-4">
          <SegmentedControl
            appearance={scheme}
            values={THEME_LABELS}
            selectedIndex={Math.max(0, THEME_OPTIONS.indexOf(themeMode))}
            tintColor={colors.accent}
            onChange={(event) =>
              setThemeMode(THEME_OPTIONS[event.nativeEvent.selectedSegmentIndex] ?? 'system')
            }
          />
        </View>
      </SettingsGroup>

      {isAndroid ? (
        <SettingsGroup>
          <ToggleRow
            label="Wallpaper colors"
            subtitle="Material You palette from your wallpaper"
            value={dynamicColor}
            onValueChange={setDynamicColor}
          />
          <View className="bg-sf-separator ml-4 h-px" />
          <ToggleRow
            label="Pure black"
            subtitle="True-black AMOLED surfaces in dark mode"
            value={pureBlack}
            onValueChange={setPureBlack}
          />
        </SettingsGroup>
      ) : null}

      <SettingsGroup title="Accent">
        <View className="gap-3 px-4 py-4">
          <View
            className="flex-row flex-wrap items-center gap-3.5"
            style={{ opacity: accentDisabled ? 0.4 : 1 }}>
            <Swatch
              selected={!accentColor}
              ringColor={colors.accent}
              checkColor={colors.text2}
              borderColor={colors.separator}
              isDefault
              onPress={() => setAccentColor(null)}
            />
            {ACCENT_PRESETS.map((color) => (
              <Swatch
                key={color}
                color={color}
                selected={accentColor === color}
                ringColor={colors.text}
                checkColor="#FFFFFF"
                onPress={() => !accentDisabled && setAccentColor(color)}
              />
            ))}
          </View>
          {accentDisabled ? (
            <Text className="text-sf-text-3 text-xs">
              Turn off wallpaper colors to choose an accent.
            </Text>
          ) : null}
        </View>
      </SettingsGroup>
    </SettingsScreen>
  );
}

function ToggleRow({
  label,
  subtitle,
  value,
  onValueChange,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 py-3.5">
      <View className="flex-1">
        <Text className="text-sf-text text-base">{label}</Text>
        {subtitle ? <Text className="text-sf-text-2 mt-0.5 text-xs">{subtitle}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function Swatch({
  color,
  selected,
  ringColor,
  borderColor,
  checkColor,
  isDefault,
  onPress,
}: {
  color?: string;
  selected: boolean;
  ringColor: string;
  borderColor?: string;
  checkColor: string;
  isDefault?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: color ?? 'transparent',
          borderWidth: selected ? 2.5 : isDefault ? 1 : 0,
          borderColor: selected ? ringColor : (borderColor ?? 'transparent'),
          boxShadow: color ? `0 1px 4px ${color}55` : undefined,
        }}>
        {isDefault && !selected ? (
          <MaterialCommunityIcons name="cancel" size={18} color={checkColor} />
        ) : null}
        {selected ? <MaterialCommunityIcons name="check" size={18} color={checkColor} /> : null}
      </View>
    </Pressable>
  );
}
