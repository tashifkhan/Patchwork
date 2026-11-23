const { withAndroidManifest } = require('expo/config-plugins');

/**
 * ML Kit's GenAI Prompt API (Gemini Nano, see modules/patchwork-local-ai)
 * declares minSdk 26. The app keeps minSdk 24, so the manifest merger needs
 * permission to accept those libraries. The module only loads them on
 * Android 8.0 and newer; older phones report on-device AI as unsupported.
 */
const LIBRARIES = ['com.google.mlkit.genai.prompt', 'com.google.mlkit.genai.common', 'com.google.mlkit.genai.schema'];

module.exports = function withAndroidLocalAi(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$ = { ...manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
    const usesSdk = (manifest['uses-sdk'] ??= [{ $: {} }]);
    const entry = usesSdk[0];
    entry.$ = entry.$ ?? {};
    const existing = (entry.$['tools:overrideLibrary'] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    entry.$['tools:overrideLibrary'] = [...new Set([...existing, ...LIBRARIES])].join(',');
    return mod;
  });
};
