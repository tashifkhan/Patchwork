const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Drop `assetsPaths` from MainActivity's `android:configChanges`.
 *
 * Android applies a new Material You wallpaper palette as an `assetsPaths`
 * configuration change. Expo's template lists it in `configChanges`, so the
 * activity handles the change itself and is never recreated. Its resources
 * keep the old system colors for the life of the process, and the app stays on
 * the previous palette until it is killed. Without the flag, Android recreates
 * the activity and the theme provider reads the new palette.
 */
module.exports = function withAndroidWallpaperRecreate(config) {
  return withAndroidManifest(config, (mod) => {
    const activities = mod.modResults.manifest.application?.[0]?.activity ?? [];
    for (const activity of activities) {
      if (activity.$['android:name'] !== '.MainActivity') continue;
      const current = activity.$['android:configChanges'];
      if (!current) continue;
      activity.$['android:configChanges'] = current
        .split('|')
        .filter((flag) => flag !== 'assetsPaths')
        .join('|');
    }
    return mod;
  });
};
