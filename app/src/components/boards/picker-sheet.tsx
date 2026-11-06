import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Modal, Platform, Pressable } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { useTheme } from '@/components/theme/context';
import { sheetOverlayStyle, useSheetPanel } from '@/components/ui/sheet-panel';
import { haptics } from '@/lib/haptics';
import { DURATION, EASING } from '@/lib/motion';
import { ScrollView, Text, View } from '@/tw';

export interface PickerSheetItem {
  key: string;
  label: string;
  subtitle?: string;
  leading?: ReactNode;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  selected?: boolean;
  onPress: () => void;
}

/**
 * Material 3 bottom sheet with one row per choice: used to switch boards and
 * to move a card to another column.
 */
export function PickerSheet({
  visible,
  title,
  subtitle,
  items,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  items: PickerSheetItem[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const panel = useSheetPanel(12);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(DURATION.short4)} style={sheetOverlayStyle()}>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.32)', justifyContent: 'flex-end' }}>
          <Animated.View
            entering={SlideInDown.duration(DURATION.medium4).easing(EASING.emphasizedDecelerate)}
            onStartShouldSetResponder={() => true}
            style={{
              ...panel.style,
              maxHeight: '80%',
            }}>
            {panel.background}
            <View className="items-center" style={{ paddingTop: 16, paddingBottom: 8 }}>
              <View style={{ width: 32, height: 4, borderRadius: 2, backgroundColor: colors.gray }} />
            </View>
            <View className="px-6 pb-2">
              <Text numberOfLines={2} style={{ fontSize: 22, fontWeight: '600', color: colors.text }}>
                {title}
              </Text>
              {subtitle ? (
                <Text numberOfLines={2} style={{ fontSize: 14, color: colors.text2, marginTop: 2 }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4 }}>
              {items.map((item) => (
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
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
