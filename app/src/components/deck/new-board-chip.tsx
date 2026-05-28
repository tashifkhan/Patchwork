import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { Text, View } from '@/tw';

// A chip that opens the dedicated New Board screen. Kept tiny so it can sit
// inline in the board selector without crushing its neighbours.
export function NewBoardChip() {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/deck/new-board')}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <View
        className="bg-sf-bg-2 flex-row items-center gap-2 rounded-full px-4 py-1.5"
        style={{ borderCurve: 'continuous' }}>
        <MaterialCommunityIcons name="plus" size={16} color={colors.accent} />
        <Text className="text-sf-blue text-sm font-semibold">New board</Text>
      </View>
    </Pressable>
  );
}
