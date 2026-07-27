import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MenuView } from '@expo/ui/community/menu';
import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { GitHubRepo } from '@/api/types';
import { useTheme } from '@/components/theme/context';

const ITEM_HEIGHT = 52;
const MENU_GAP = 6;
const SCREEN_MARGIN = 12;

interface RepositoryPickerProps {
  repositories: GitHubRepo[];
  value: string;
  onChange: (repositoryName: string) => void;
}

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function RepositoryPicker({
  repositories,
  value,
  onChange,
}: RepositoryPickerProps) {
  const selected =
    repositories.find((repository) => repository.full_name === value) ??
    repositories[0];

  if (process.env.EXPO_OS === 'ios') {
    return (
      <MenuView
        actions={repositories.map((repository) => ({
          id: repository.full_name,
          title: repository.full_name,
          state:
            repository.full_name === selected?.full_name
              ? ('on' as const)
              : ('off' as const),
        }))}
        onPressAction={({ nativeEvent }) => onChange(nativeEvent.event)}>
        <PickerTrigger repositoryName={selected?.full_name ?? 'Select repository'} />
      </MenuView>
    );
  }

  return (
    <AndroidRepositoryPicker
      repositories={repositories}
      selectedName={selected?.full_name ?? ''}
      onChange={onChange}
    />
  );
}

function AndroidRepositoryPicker({
  repositories,
  selectedName,
  onChange,
}: {
  repositories: GitHubRepo[];
  selectedName: string;
  onChange: (repositoryName: string) => void;
}) {
  const { colors } = useTheme();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  function open() {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }

  const topLimit = insets.top + SCREEN_MARGIN;
  const bottomLimit = screenHeight - insets.bottom - SCREEN_MARGIN;
  const spaceBelow = anchor
    ? bottomLimit - (anchor.y + anchor.height) - MENU_GAP
    : 0;
  const spaceAbove = anchor ? anchor.y - topLimit - MENU_GAP : 0;
  const openBelow = spaceBelow >= ITEM_HEIGHT * 3 || spaceBelow >= spaceAbove;
  const availableHeight = Math.max(
    openBelow ? spaceBelow : spaceAbove,
    ITEM_HEIGHT * 2
  );
  const menuHeight = Math.min(
    repositories.length * ITEM_HEIGHT + 8,
    availableHeight
  );
  const menuWidth = anchor
    ? Math.min(anchor.width, screenWidth - SCREEN_MARGIN * 2)
    : 0;
  const left = anchor
    ? Math.min(
        Math.max(anchor.x, SCREEN_MARGIN),
        screenWidth - menuWidth - SCREEN_MARGIN
      )
    : 0;
  const top = anchor
    ? openBelow
      ? anchor.y + anchor.height + MENU_GAP
      : anchor.y - menuHeight - MENU_GAP
    : 0;

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={`Repository, ${selectedName}`}
        accessibilityHint="Opens the repository list"
        onPress={open}>
        <PickerTrigger repositoryName={selectedName} />
      </Pressable>

      <Modal
        visible={anchor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAnchor(null)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close repository list"
          style={{ flex: 1 }}
          onPress={() => setAnchor(null)}>
          <View
            style={{
              position: 'absolute',
              top,
              left,
              width: menuWidth,
              maxHeight: menuHeight,
              backgroundColor: colors.bg3,
              borderRadius: 16,
              borderCurve: 'continuous',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
            }}>
            <ScrollView bounces={false}>
              {repositories.map((repository) => {
                const isSelected = repository.full_name === selectedName;
                return (
                  <Pressable
                    key={repository.id}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => {
                      onChange(repository.full_name);
                      setAnchor(null);
                    }}
                    android_ripple={{ color: colors.gray3 }}
                    style={({ pressed }) => ({
                      backgroundColor: isSelected
                        ? colors.selectionBg
                        : pressed
                          ? colors.bg2
                          : 'transparent',
                    })}>
                    <View
                      style={{
                        height: ITEM_HEIGHT,
                        paddingHorizontal: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                      }}>
                      <MaterialCommunityIcons
                        name="source-repository"
                        size={19}
                        color={
                          isSelected ? colors.onSelectionBg : colors.text2
                        }
                      />
                      <Text
                        numberOfLines={1}
                        style={{
                          flex: 1,
                          fontSize: 16,
                          color: isSelected
                            ? colors.onSelectionBg
                            : colors.text,
                        }}>
                        {repository.full_name}
                      </Text>
                      {isSelected ? (
                        <MaterialCommunityIcons
                          name="check"
                          size={20}
                          color={colors.onSelectionBg}
                        />
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function PickerTrigger({ repositoryName }: { repositoryName: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        minHeight: 54,
        borderRadius: 16,
        borderCurve: 'continuous',
        backgroundColor: colors.bg3,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
      <MaterialCommunityIcons
        name="source-repository"
        size={20}
        color={colors.accent}
      />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: colors.text,
          fontSize: 16,
          fontWeight: '500',
        }}>
        {repositoryName}
      </Text>
      <MaterialCommunityIcons
        name="chevron-down"
        size={22}
        color={colors.text2}
      />
    </View>
  );
}
