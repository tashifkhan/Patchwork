// Live Activities are iOS-only. expo-widgets 58 has no LiveActivityFactory on Android,
// so importing FocusActivity here would throw at module load.
export * from './focus.web';
