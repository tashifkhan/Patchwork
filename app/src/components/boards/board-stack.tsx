import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import type { BoardSummary } from '@/features/boards/model';
import { useTheme } from '@/components/theme/context';
import { PressGlow, useElasticPress } from '@/components/ui/elastic';
import { RiseIn } from '@/components/ui/motion';
import { canAddToHomeScreen, pinBoard } from '@/features/shortcuts/pin-shortcut';
import { haptics } from '@/lib/haptics';
import { listTone } from '@/lib/smart-lists';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

import { BoardTile } from './board-tile';

const CARD_HEIGHT = 140;
/** How much of each card the next one covers, like My lists. */
const OVERLAP = 36;
const RADIUS = 32;

/**
 * Android: boards as a fanned stack of tonal cards, the same look as My
 * lists. Each card has the board's avatar, name and key, a star chip and an
 * arrow out. Tapping opens the board; the chip stars or unstars it;
 * long-pressing asks the launcher to pin the board to the home screen.
 */
export function BoardStack({
  boards,
  favorites,
  recents,
  onOpen,
  onToggleFavorite,
}: {
  boards: BoardSummary[];
  favorites: string[];
  /** Board refs, most recent first. */
  recents: string[];
  onOpen: (board: BoardSummary) => void;
  onToggleFavorite: (ref: string) => void;
}) {
  // Read once: whether this launcher takes pinned shortcuts doesn't change.
  const [canPin] = useState(canAddToHomeScreen);
  return (
    <View>
      {boards.map((board, index) => (
        <RiseIn
          key={board.ref}
          index={index}
          rise={36}
          fromScale={0.94}
          style={{ marginTop: index === 0 ? 0 : -OVERLAP, zIndex: index }}>
          <BoardCard
            board={board}
            index={index}
            last={index === boards.length - 1}
            starred={favorites.includes(board.ref)}
            recent={recents[0] === board.ref}
            onOpen={() => onOpen(board)}
            onToggleFavorite={() => onToggleFavorite(board.ref)}
            onPin={canPin ? () => void pinBoard(board) : undefined}
          />
        </RiseIn>
      ))}
    </View>
  );
}

function BoardCard({
  board,
  index,
  last,
  starred,
  recent,
  onOpen,
  onToggleFavorite,
  onPin,
}: {
  board: BoardSummary;
  index: number;
  last: boolean;
  starred: boolean;
  /** The last board opened. */
  recent: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
  /** Long-press: add the board to the home screen. */
  onPin?: () => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const { fill, ink } = listTone(colors, dark, index);
  const press = useElasticPress({ maxStretch: 0.015, maxTranslate: 1.5, pressedScale: 0.97, releaseOnDrag: true });
  // The arrow leans out toward its corner while the card is held.
  const arrow = useAnimatedStyle(() => ({
    transform: [
      { translateX: 4 * press.glow.value },
      { translateY: -4 * press.glow.value },
      { scale: 1 + 0.12 * press.glow.value },
    ],
  }));
  const chip = withAlpha('#FFFFFF', dark ? 0.12 : 0.62);

  return (
    <Animated.View {...press.handlers} style={press.style}>
      <Pressable
        onPress={() => {
          haptics.tap();
          onOpen();
        }}
        onLongPress={
          onPin
            ? () => {
                haptics.impact('medium');
                onPin();
              }
            : undefined
        }
        onPressOut={press.release}
        accessibilityRole="button"
        accessibilityLabel={`${board.title}, ${board.subtitle}${starred ? ', starred' : ''}`}
        accessibilityHint={onPin ? 'Long-press to add the board to the home screen' : undefined}
        style={{
          height: last ? CARD_HEIGHT - OVERLAP + 8 : CARD_HEIGHT,
          borderRadius: RADIUS,
          borderCurve: 'continuous',
          overflow: 'hidden',
          backgroundColor: fill,
          paddingHorizontal: 22,
          paddingTop: 20,
          boxShadow: index === 0 ? undefined : `0 -6px 18px ${withAlpha('#000000', dark ? 0.4 : 0.1)}`,
        }}>
        <PressGlow press={press} color={withAlpha(ink, dark ? 0.12 : 0.1)} radius={RADIUS} size={60} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BoardTile board={board} size={30} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 22, fontWeight: '600', color: ink }}>
            {board.title}
          </Text>
          <Pressable
            onPress={() => {
              haptics.toggle(!starred);
              onToggleFavorite();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={starred ? `Unstar ${board.title}` : `Star ${board.title}`}
            android_ripple={{ color: withAlpha(ink, 0.2), borderless: false }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              height: 32,
              paddingHorizontal: starred ? 12 : 0,
              width: starred ? undefined : 32,
              justifyContent: 'center',
              borderRadius: 16,
              overflow: 'hidden',
              backgroundColor: chip,
            }}>
            <MaterialCommunityIcons
              name={starred ? 'star' : 'star-outline'}
              size={18}
              color={starred ? colors.yellow : ink}
            />
            {starred ? <Text style={{ fontSize: 13, fontWeight: '600', color: ink }}>Starred</Text> : null}
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: withAlpha(ink, 0.78) }}>
            {board.subtitle}
            {recent ? ' · Last opened' : ''}
          </Text>
          <Animated.View style={arrow}>
            <MaterialCommunityIcons name="arrow-top-right" size={26} color={ink} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
