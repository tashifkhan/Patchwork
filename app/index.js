import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import 'expo-router/entry';

if (Platform.OS === 'android') {
  // Registered at module top-level so the OS-spawned headless JS task can
  // dispatch widget lifecycle events without booting the React tree.
  const { widgetTaskHandler } = require('./src/widgets/android/handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
