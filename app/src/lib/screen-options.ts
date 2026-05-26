import { Platform } from 'react-native';

// Shared native stack header options. Large titles + transparent blur header on
// iOS for an Apple-native feel; standard header elsewhere.
export const stackScreenOptions = {
  headerLargeTitle: true,
  headerTransparent: Platform.OS === 'ios',
  headerShadowVisible: false,
  headerLargeTitleShadowVisible: false,
  headerBlurEffect: 'systemMaterial',
  headerBackButtonDisplayMode: 'minimal',
} as const;
