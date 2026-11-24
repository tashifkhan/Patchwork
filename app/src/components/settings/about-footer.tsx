import Constants from 'expo-constants';
import { Pressable } from 'react-native';

import { PatchMascot } from '@/components/mascot/patch-mascot';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { Text } from '@/tw';

/** Bottom of Settings: Patch waving over the version. Opens About. */
export function AboutFooter({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const name = Constants.expoConfig?.name ?? 'Patchwork';
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`About ${name}, version ${version}`}
      style={({ pressed }) => ({ alignItems: 'center', gap: 6, paddingTop: 8, paddingBottom: 8, opacity: pressed ? 0.6 : 1 })}>
      <PatchMascot mood="hello" size={80} interactive={false} />
      <Text style={{ fontSize: 13, color: colors.text3, fontVariant: ['tabular-nums'] }}>
        {name} · v{version}
      </Text>
    </Pressable>
  );
}
