export type { ButtonProps, ButtonVariant } from './button-base';

/**
 * Material 3 button, RN-drawn on every platform.
 *
 * This deliberately does *not* use `@expo/ui/jetpack-compose` buttons on
 * Android. Verified on SDK 56 / @expo/ui 56.0.22: a Compose `Button` inside a
 * `Host` is measured and laid out correctly — it appears in the view hierarchy
 * with real bounds and is tappable — but never paints, so every primary CTA in
 * the app rendered as an invisible tap target. That reproduced on plain screens
 * and inside bottom sheets, with and without `matchContents`, and with the
 * width-measurement opacity gate removed.
 *
 * Other Compose components in this app (`Switch`, `FilterChip`,
 * `ModalBottomSheet`, `FloatingActionButton`, loading indicators) do paint
 * correctly and are still used natively — see the `.android.tsx` variants.
 * Revisit this once @expo/ui fixes Button painting.
 */
export { ButtonBase as Button } from './button-base';
