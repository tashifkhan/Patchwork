import AppTabs from '@/components/app-tabs';

// Wraps the tab navigator so sheet routes can live at the root Stack and
// overlay the tab bar on Android (where formSheet renders inside its parent
// stack rather than as a true system overlay).
export default function TabsLayout() {
  return <AppTabs />;
}
