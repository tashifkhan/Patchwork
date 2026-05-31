module.exports = ({ config }) => {
  const isDev = process.env.APP_VARIANT === 'development';
  const iosBundleId = isDev ? 'codes.tashhif.tasks.dev' : 'codes.tashhif.tasks';
  const widgetsGroupId = `group.${iosBundleId}`;
  const widgetsBundleId = `${iosBundleId}.ExpoWidgetsTarget`;

  return {
    ...config,
    name: isDev ? 'todo (Dev)' : 'todo',
    ios: {
      ...config.ios,
      bundleIdentifier: iosBundleId,
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
      'expo-font',
      'expo-image',
      [
        'react-native-android-widget',
        {
          widgets: [
            {
              name: 'Today',
              label: 'Today',
              minWidth: '180dp',
              minHeight: '180dp',
              targetCellWidth: 3,
              targetCellHeight: 3,
              description: 'Tasks due today.',
              updatePeriodMillis: 1800000,
              resizeMode: 'horizontal|vertical',
              widgetFeatures: 'reconfigurable',
            },
            {
              name: 'Upcoming',
              label: 'Upcoming',
              minWidth: '250dp',
              minHeight: '180dp',
              targetCellWidth: 4,
              targetCellHeight: 3,
              description: 'Overdue plus what is due next.',
              updatePeriodMillis: 1800000,
              resizeMode: 'horizontal|vertical',
              widgetFeatures: 'reconfigurable',
            },
            {
              name: 'List',
              label: 'List',
              minWidth: '180dp',
              minHeight: '180dp',
              targetCellWidth: 3,
              targetCellHeight: 3,
              description: 'Tasks from your last opened list.',
              updatePeriodMillis: 1800000,
              resizeMode: 'horizontal|vertical',
              widgetFeatures: 'reconfigurable',
            },
          ],
        },
      ],
      [
        'expo-widgets',
        {
          bundleIdentifier: widgetsBundleId,
          groupIdentifier: widgetsGroupId,
          enablePushNotifications: true,
          widgets: [
            {
              name: 'TodayWidget',
              displayName: 'Today',
              description: 'Tasks due today across your accounts.',
              supportedFamilies: ['systemSmall', 'systemMedium', 'systemLarge'],
              android: null,
            },
            {
              name: 'UpcomingWidget',
              displayName: 'Upcoming',
              description: 'Overdue plus what is due next.',
              supportedFamilies: ['systemMedium', 'systemLarge'],
              android: null,
            },
            {
              name: 'ListWidget',
              displayName: 'List',
              description: 'Tasks from your last opened list.',
              supportedFamilies: ['systemSmall', 'systemMedium'],
              android: null,
            },
            {
              name: 'LockWidget',
              displayName: 'Quick View',
              description: 'Lock Screen glance for your tasks.',
              supportedFamilies: ['accessoryCircular', 'accessoryRectangular', 'accessoryInline'],
              android: null,
            },
          ],
        },
      ],
      './plugins/with-android-workmanager-dedupe',
    ],
  };
};
