import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, View as RNView, Text as RNText, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuView } from '@expo/ui/community/menu';

import { useTheme } from '@/components/theme/context';

const ALL_ID = '__all__';
const NEW_ID = '__new__';
const EDIT_ID = '__edit__';

const MENU_WIDTH = 260;
const ITEM_HEIGHT = 48;
const GAP = 6;

export interface TaskListOption {
  id: string;
  name: string;
}

interface TaskListMenuProps {
  lists: TaskListOption[];
  selectedListId: string | null;
  onSelect: (listId: string | null) => void;
  onCreate: () => void;
  onEdit?: () => void;
}

/**
 * Header title dropdown for switching the visible task list. Mirrors
 * `ServerTypeMenu` — native UIMenu on iOS, anchored Material 3 menu on
 * Android/web — with "New list…" and, when a specific list is selected,
 * "Edit list…" at the bottom.
 */
export function TaskListMenu({ lists, selectedListId, onSelect, onCreate, onEdit }: TaskListMenuProps) {
  const { colors } = useTheme();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const triggerRef = useRef<RNView>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; h: number } | null>(null);

  const selected = lists.find((l) => l.id === selectedListId) ?? null;
  const title = selected ? selected.name : 'All Tasks';
  const canEdit = Boolean(onEdit && selected);

  if (Platform.OS === 'ios') {
    return (
      <MenuView
        actions={[
          {
            id: ALL_ID,
            title: 'All Tasks',
            state: selectedListId == null ? 'on' : 'off',
          },
          ...lists.map((list) => ({
            id: list.id,
            title: list.name,
            state: list.id === selectedListId ? ('on' as const) : ('off' as const),
          })),
          {
            id: NEW_ID,
            title: 'New list…',
            image: 'plus',
          },
          ...(canEdit
            ? [
                {
                  id: EDIT_ID,
                  title: 'Edit list…',
                  image: 'pencil',
                },
              ]
            : []),
        ]}
        onPressAction={({ nativeEvent }) => {
          const id = nativeEvent.event;
          if (id === NEW_ID) onCreate();
          else if (id === EDIT_ID) onEdit?.();
          else if (id === ALL_ID) onSelect(null);
          else onSelect(id);
        }}>
        <Trigger title={title} colors={colors} />
      </MenuView>
    );
  }

  function open() {
    triggerRef.current?.measureInWindow((x, y, _w, h) => {
      setAnchor({ x, y, h });
    });
  }

  const itemCount = lists.length + 2 + (canEdit ? 1 : 0); // All + lists + New + Edit
  const topLimit = insets.top + 8;
  const bottomLimit = screenH - insets.bottom - 8;
  const spaceBelow = anchor ? bottomLimit - (anchor.y + anchor.h) - GAP : 0;
  const spaceAbove = anchor ? anchor.y - topLimit - GAP : 0;
  const openBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
  const available = Math.max(openBelow ? spaceBelow : spaceAbove, ITEM_HEIGHT * 2);
  const menuHeight = Math.min(itemCount * ITEM_HEIGHT + 8, available);
  const top = anchor ? (openBelow ? anchor.y + anchor.h + GAP : anchor.y - menuHeight - GAP) : 0;
  const left = anchor ? Math.min(Math.max(anchor.x, 12), screenW - MENU_WIDTH - 12) : 0;

  return (
    <>
      <Pressable ref={triggerRef} onPress={open} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <Trigger title={title} colors={colors} />
      </Pressable>

      <Modal
        visible={anchor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setAnchor(null)}>
        <Pressable style={{ flex: 1 }} onPress={() => setAnchor(null)}>
          <RNView
            style={{
              position: 'absolute',
              top,
              left,
              width: MENU_WIDTH,
              maxHeight: menuHeight,
              backgroundColor: colors.bg3,
              borderRadius: 16,
              borderCurve: 'continuous',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
              elevation: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.45,
              shadowRadius: 30,
            }}>
            <ScrollView bounces={false}>
              <Row
                label="All Tasks"
                selected={selectedListId == null}
                colors={colors}
                onPress={() => {
                  onSelect(null);
                  setAnchor(null);
                }}
              />
              {lists.map((list) => (
                <Row
                  key={list.id}
                  label={list.name}
                  selected={list.id === selectedListId}
                  colors={colors}
                  onPress={() => {
                    onSelect(list.id);
                    setAnchor(null);
                  }}
                />
              ))}
              <RNView style={{ height: 1, backgroundColor: colors.bg2, marginVertical: 4 }} />
              <Pressable
                onPress={() => {
                  setAnchor(null);
                  onCreate();
                }}
                android_ripple={{ color: colors.gray3 }}
                style={({ pressed }) => ({ backgroundColor: pressed ? colors.bg2 : 'transparent' })}>
                <RNView
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 16,
                    height: ITEM_HEIGHT,
                  }}>
                  <MaterialCommunityIcons name="plus" size={20} color={colors.accent} />
                  <RNText style={{ fontSize: 16, color: colors.accent, fontWeight: '600' }}>New list…</RNText>
                </RNView>
              </Pressable>
              {canEdit ? (
                <Pressable
                  onPress={() => {
                    setAnchor(null);
                    onEdit?.();
                  }}
                  android_ripple={{ color: colors.gray3 }}
                  style={({ pressed }) => ({ backgroundColor: pressed ? colors.bg2 : 'transparent' })}>
                  <RNView
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 16,
                      height: ITEM_HEIGHT,
                    }}>
                    <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.accent} />
                    <RNText style={{ fontSize: 16, color: colors.accent, fontWeight: '600' }}>Edit list…</RNText>
                  </RNView>
                </Pressable>
              ) : null}
            </ScrollView>
          </RNView>
        </Pressable>
      </Modal>
    </>
  );
}

function Trigger({ title, colors }: { title: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}>
      <RNText
        numberOfLines={1}
        style={{ fontSize: 17, fontWeight: '600', color: colors.text, maxWidth: 220 }}>
        {title}
      </RNText>
      <MaterialCommunityIcons name="menu-down" size={22} color={colors.text2} />
    </RNView>
  );
}

function Row({
  label,
  selected,
  colors,
  onPress,
}: {
  label: string;
  selected: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: colors.gray3 }}
      style={({ pressed }) => ({
        backgroundColor: selected ? colors.selectionBg : pressed ? colors.bg2 : 'transparent',
      })}>
      <RNView
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          height: ITEM_HEIGHT,
        }}>
        <RNText
          numberOfLines={1}
          style={{ flex: 1, fontSize: 16, color: selected ? colors.onSelectionBg : colors.text }}>
          {label}
        </RNText>
        {selected ? (
          <MaterialCommunityIcons name="check" size={20} color={colors.onSelectionBg} />
        ) : null}
      </RNView>
    </Pressable>
  );
}
