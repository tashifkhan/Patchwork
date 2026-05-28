// Shared native stack header options. Large titles everywhere; a solid (themed)
// header — not transparent/blurred — so the title renders reliably regardless of
// whether the screen's root is a scroll view (transparent + blur large titles
// were dropping the title on scroll-rooted screens). The header background and
// title color come from the navigation theme (see components/theme/shell).
export const stackScreenOptions = {
  headerLargeTitle: true,
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal',
} as const;
