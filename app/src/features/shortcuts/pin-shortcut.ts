import { canPinShortcuts, pinShortcut } from '../../../modules/patchwork-shortcuts/src';

/** Android launchers that take pinned shortcuts. Always false on iOS and web. */
export function canAddToHomeScreen(): boolean {
  return process.env.EXPO_OS === 'android' && canPinShortcuts();
}

/** Pin a list to the home screen. Tapping it opens Tasks filtered to that list. */
export function pinList(list: { id: string; name: string }) {
  return pinShortcut({
    id: `list:${list.id}`,
    label: list.name,
    url: `patchwork:///?list=${encodeURIComponent(list.id)}`,
    icon: 'list',
  });
}

/** Pin a Deck or Jira board to the home screen. */
export function pinBoard(board: { ref: string; title: string }) {
  return pinShortcut({
    id: `board:${board.ref}`,
    label: board.title,
    url: `patchwork:///deck/board/${encodeURIComponent(board.ref)}`,
    icon: 'board',
  });
}
