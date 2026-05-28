import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, View as RNView, Text as RNText, ScrollView, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MenuView from '@expo/ui/community/menu';

import { useTheme } from '@/components/theme/context';

import { SERVER_TYPES, serverTypeLabel, type ServerTypeMenuProps } from './server-type';

const MENU_WIDTH = 240;
const ITEM_HEIGHT = 48;
const GAP = 6;

/**
 * Anchored dropdown for picking the CalDAV server type. A single cross-platform
 * implementation (RN Modal + measured anchor) that mirrors the Material 3 menu —
 * it opens directly under (or above) the trigger and flips to stay on screen.
 */
export function ServerTypeMenu({ value, onChange }: ServerTypeMenuProps) {
  const { colors } = useTheme();

  if (Platform.OS === 'ios') {
    return (
      <MenuView
        actions={SERVER_TYPES.map((option) => ({
          id: option.value,
          title: option.label,
          state: option.value === value ? 'on' : 'off',
        }))}
        onPressAction={({ nativeEvent }) => {
          onChange(nativeEvent.event as any);
        }}>
        <Pressable style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}>
            <RNText style={{ fontSize: 18, color: colors.text }}>{serverTypeLabel(value)}</RNText>
            <MaterialCommunityIcons name="menu-down" size={22} color={colors.text2} />
          </RNView>
        </Pressable>
      </MenuView>
    );
  }

  const { height: screenH, width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const triggerRef = useRef<RNView>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number; h: number } | null>(null);

  function open() {
    triggerRef.current?.measureInWindow((x, y, _w, h) => {
      setAnchor({ x, y, h });
    });
  }

  // Choose the side with more room, then cap the height to that space so the menu
  // never slides under the header/status bar and scrolls instead.
  const topLimit = insets.top + 8;
  const bottomLimit = screenH - insets.bottom - 8;
  const spaceBelow = anchor ? bottomLimit - (anchor.y + anchor.h) - GAP : 0;
  const spaceAbove = anchor ? anchor.y - topLimit - GAP : 0;
  const openBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
  const available = Math.max(openBelow ? spaceBelow : spaceAbove, ITEM_HEIGHT * 2);
  const menuHeight = Math.min(SERVER_TYPES.length * ITEM_HEIGHT + 8, available);
  const top = anchor
    ? openBelow
      ? anchor.y + anchor.h + GAP
      : anchor.y - menuHeight - GAP
    : 0;
  const left = anchor ? Math.min(Math.max(anchor.x, 12), screenW - MENU_WIDTH - 12) : 0;

  return (
    <>
      <Pressable ref={triggerRef} onPress={open} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
        <RNView style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 }}>
          <RNText style={{ fontSize: 18, color: colors.text }}>{serverTypeLabel(value)}</RNText>
          <MaterialCommunityIcons name="menu-down" size={22} color={colors.text2} />
        </RNView>
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
              {SERVER_TYPES.map((option) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setAnchor(null);
                    }}
                    android_ripple={{ color: colors.gray3 }}
                    style={({ pressed }) => ({
                      backgroundColor: selected
                        ? colors.selectionBg
                        : pressed
                          ? colors.bg2
                          : 'transparent',
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
                        style={{
                          fontSize: 16,
                          color: selected ? colors.onSelectionBg : colors.text,
                        }}>
                        {option.label}
                      </RNText>
                      {selected ? (
                        <MaterialCommunityIcons name="check" size={20} color={colors.onSelectionBg} />
                      ) : null}
                    </RNView>
                  </Pressable>
                );
              })}
            </ScrollView>
          </RNView>
        </Pressable>
      </Modal>
    </>
  );
}
