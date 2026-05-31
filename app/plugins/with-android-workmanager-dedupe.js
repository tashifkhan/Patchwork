const { withProjectBuildGradle } = require('expo/config-plugins');

const EXCLUDE_SNIPPET = `
// WorkManager 2.8+ ships Kotlin extension classes in work-runtime. Some Expo
// native modules still pull older work-runtime-ktx transitively, which creates
// duplicate classes in release builds.
configurations.configureEach {
    exclude group: 'androidx.work', module: 'work-runtime-ktx'
}
`;

module.exports = function withAndroidWorkManagerDedupe(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      return mod;
    }

    if (!mod.modResults.contents.includes("module: 'work-runtime-ktx'")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /allprojects\s*\{\s*/,
        (match) => `${match}${EXCLUDE_SNIPPET}\n`
      );
    }

    return mod;
  });
};
