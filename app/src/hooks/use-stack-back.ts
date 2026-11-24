import { type Href, router, useNavigation } from 'expo-router';
import { useCallback } from 'react';

/**
 * Back within this screen's own stack. `router.back()` walks the app-wide
 * history, so a board or card opened from a link or a notification, with
 * nothing under it in the Boards stack, would fall through to whatever tab
 * was open before (Tasks). When there is nothing under this screen here, go
 * to `fallback`, its parent in the stack, instead.
 */
export function useStackBack(fallback: Href) {
  const navigation = useNavigation();
  return useCallback(() => {
    const state = navigation.getState();
    if (state && state.index > 0) navigation.goBack();
    else router.replace(fallback);
  }, [navigation, fallback]);
}
