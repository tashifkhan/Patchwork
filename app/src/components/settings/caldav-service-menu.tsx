import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MenuView } from '@expo/ui/community/menu';
import { SymbolView } from 'expo-symbols';
import { Platform, Text, View } from 'react-native';

import { useTheme } from '@/components/theme/context';

const SERVICES = [
  { id: 'nextcloud', title: 'Nextcloud' },
  { id: 'icloud', title: 'iCloud' },
  { id: 'owncloud', title: 'ownCloud' },
  { id: 'other', title: 'Other CalDAV' },
] as const;

export type CalDavService = typeof SERVICES[number]['id'];

export function CalDavServiceMenu({ value, onChange }: {
  value: CalDavService;
  onChange: (value: CalDavService) => void;
}) {
  const { colors } = useTheme();
  const ios = Platform.OS === 'ios';
  const selected = SERVICES.find((service) => service.id === value);

  return (
    <MenuView
      actions={SERVICES.map((service) => ({
        ...service,
        state: service.id === value ? 'on' : 'off',
      }))}
      onPressAction={({ nativeEvent }) => {
        const next = SERVICES.find((service) => service.id === nativeEvent.event);
        if (next) onChange(next.id);
      }}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Service, ${selected?.title}`}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 5 }}>
        <Text style={{ fontSize: ios ? 17 : 16, color: ios ? colors.text2 : colors.text }}>
          {selected?.title}
        </Text>
        {ios ? (
          <SymbolView name="chevron.up.chevron.down" size={13} weight="semibold" tintColor={colors.text2} />
        ) : (
          <MaterialCommunityIcons name="menu-down" size={22} color={colors.text2} />
        )}
      </View>
    </MenuView>
  );
}
