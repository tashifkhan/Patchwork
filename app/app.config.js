module.exports = ({ config }) => {
  const isDev = process.env.APP_VARIANT === 'development';
  const iosBundleId = isDev ? 'codes.tashhif.patchwork.dev' : 'codes.tashhif.patchwork';
  const widgetsGroupId = `group.${iosBundleId}`;
  const widgetsBundleId = `${iosBundleId}.ExpoWidgetsTarget`;

  return {
    ...config,
    name: isDev ? 'Patchwork (Dev)' : 'Patchwork',
    ios: {
      ...config.ios,
      bundleIdentifier: iosBundleId,
      deploymentTarget: '16.4',
      infoPlist: {
        ...(config.ios && config.ios.infoPlist),
        ITSAppUsesNonExemptEncryption: false,
      },
      entitlements: {
        ...(config.ios && config.ios.entitlements),
        'com.apple.security.application-groups': [widgetsGroupId],
      },
    },
    android: {
      ...config.android,
      package: iosBundleId,
    },
    plugins: [
      ...(config.plugins ?? []),
      'expo-background-task',
      'expo-font',
      'expo-image',
      'expo-secure-store',
      [
        'expo-widgets',
        {
          bundleIdentifier: widgetsBundleId,
          groupIdentifier: widgetsGroupId,
          enablePushNotifications: true,
          enableAndroid: true,
          widgets: [
            {
              name: 'TodayWidget',
              displayName: 'Today',
              description: 'Tasks due today across your accounts.',
              ios: { supportedFamilies: ['systemSmall', 'systemMedium', 'systemLarge'] },
              android: {
                minWidth: 180,
                minHeight: 180,
                targetCellWidth: 3,
                targetCellHeight: 3,
                initialLayout: './src/widgets/TodayWidget.android.tsx',
              },
            },
            {
              name: 'UpcomingWidget',
              displayName: 'Upcoming',
              description: 'Overdue plus what is due next.',
              ios: { supportedFamilies: ['systemMedium', 'systemLarge'] },
              android: {
                minWidth: 250,
                minHeight: 180,
                targetCellWidth: 4,
                targetCellHeight: 3,
                initialLayout: './src/widgets/UpcomingWidget.android.tsx',
              },
            },
            {
              name: 'ListWidget',
              displayName: 'List',
              description: 'Tasks from your last opened list.',
              ios: { supportedFamilies: ['systemSmall', 'systemMedium'] },
              android: {
                minWidth: 180,
                minHeight: 180,
                targetCellWidth: 3,
                targetCellHeight: 3,
                initialLayout: './src/widgets/ListWidget.android.tsx',
              },
            },
            {
              name: 'LockWidget',
              displayName: 'Quick View',
              description: 'Lock Screen glance for your tasks.',
              ios: { supportedFamilies: ['accessoryCircular', 'accessoryRectangular', 'accessoryInline'] },
              android: null,
            },
          ],
        },
      ],
      './plugins/with-android-workmanager-dedupe',
    ],
  };
};
