import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Modal, Pressable } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import type { TaskList } from '@/api/types';
import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { sheetOverlayStyle } from '@/components/ui/sheet-panel';
import { DURATION, SPRING } from '@/lib/motion';
import { ScrollView, Text, View } from '@/tw';

/**
 * Popover-style list chooser used by Move and by the add dialog. Pass `repos`
 * to offer GitHub repositories as destinations too (the add dialog does).
 */
export function ListPicker({
  visible,
  lists,
  selectedId,
  title = 'Move to',
  onSelect,
  onClose,
  repos,
  selectedRepo,
  onSelectRepo,
}: {
  visible: boolean;
  lists: TaskList[];
  selectedId: string | null;
  title?: string;
  onSelect: (list: TaskList) => void;
  onClose: () => void;
  repos?: { fullName: string }[];
  selectedRepo?: string | null;
  onSelectRepo?: (fullName: string) => void;
}) {
  const { colors } = useTheme();
  const accounts = [...new Set(lists.map((l) => l.account_name).filter(Boolean))];
  const grouped = accounts.length > 1;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(DURATION.short4)} style={sheetOverlayStyle()}>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 24 }}>
          <Animated.View
            entering={ZoomIn.springify().damping(SPRING.spatial.damping).stiffness(SPRING.spatial.stiffness)}
            onStartShouldSetResponder={() => true}
            style={{
              backgroundColor: colors.bg3,
              borderRadius: 28,
              borderCurve: 'continuous',
              maxHeight: '70%',
              paddingVertical: 12,
              boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
            }}>
            <Text
              className="text-sf-text px-6 pb-2 pt-2"
              style={{ fontSize: 20, fontWeight: '700' }}>
              {title}
            </Text>
            <ScrollView style={{ flexGrow: 0 }}>
              {(grouped ? accounts : [undefined]).map((account) => (
                <View key={account ?? 'all'}>
                  {grouped ? (
                    <Text className="text-sf-text-2 px-6 pb-1 pt-3 text-xs font-semibold uppercase">
                      {account}
                    </Text>
                  ) : null}
                  {lists
                    .filter((l) => !grouped || l.account_name === account)
                    .map((list) => {
                      const selected = !selectedRepo && list.id === selectedId;
                      return (
                        <Pressable
                          key={list.id}
                          onPress={() => {
                            haptics.selection();
                            onSelect(list);
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          android_ripple={{ color: colors.separator }}
                          style={{ minHeight: 52, paddingHorizontal: 24, justifyContent: 'center' }}>
                          <View className="flex-row items-center gap-4">
                            <MaterialCommunityIcons
                              name={selected ? 'circle-slice-8' : 'circle-outline'}
                              size={22}
                              color={selected ? colors.accent : colors.gray}
                            />
                            <Text className="text-sf-text flex-1" style={{ fontSize: 17 }}>
                              {list.name}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                </View>
              ))}
              {repos && repos.length > 0 && onSelectRepo ? (
                <View>
                  <Text
                    className="px-6 pb-1 pt-3"
                    style={{ fontSize: 13, fontWeight: '600', color: colors.accent }}>
                    GitHub issue in
                  </Text>
                  {repos.map((repo) => {
                    const selected = repo.fullName === selectedRepo;
                    return (
                      <Pressable
                        key={repo.fullName}
                        onPress={() => {
                          haptics.selection();
                          onSelectRepo(repo.fullName);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        android_ripple={{ color: colors.separator }}
                        style={{ minHeight: 52, paddingHorizontal: 24, justifyContent: 'center' }}>
                        <View className="flex-row items-center gap-4">
                          <MaterialCommunityIcons
                            name={selected ? 'circle-slice-8' : 'github'}
                            size={22}
                            color={selected ? colors.accent : colors.gray}
                          />
                          <View className="flex-1">
                            <Text className="text-sf-text" style={{ fontSize: 17 }}>
                              {repo.fullName.split('/')[1] ?? repo.fullName}
                            </Text>
                            <Text style={{ fontSize: 13, color: colors.text2 }}>
                              {repo.fullName.split('/')[0]}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
