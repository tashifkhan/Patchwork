const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  {
    ignores: ['.expo/', 'android/', 'ios/', 'dist/', 'web-build/', 'expo-env.d.ts', 'modules/*/{android,ios}/build/'],
  },
  ...expoConfig,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: { 'react-hooks/rule-suppression': 'error' },
  },
  {
    // The Node-only integration script reads named environment variables at runtime.
    files: ['scripts/caldav-integration-test.mjs'],
    rules: { 'expo/no-dynamic-env-var': 'off' },
  },
];
