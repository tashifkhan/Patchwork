import AppTabs from '@/components/app-tabs';

// Wraps the tab navigator so sheet routes can live at the root Stack and
// overlay the tab bar. On Android, sheet screens use transparentModal +
// Jetpack ModalBottomSheet (see SheetSurface / sheetScreenOptions).
export default function TabsLayout() {
  return <AppTabs />;
}
