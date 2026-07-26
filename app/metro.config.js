const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");
const path = require("node:path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Android vector drawables (`assets/symbols/*.xml`) are loaded as assets so
// `@expo/ui/jetpack-compose` `Icon` can render real Material Symbols inside
// Compose slots (FAB, chips, buttons) instead of RN vector-icon glyphs.
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, 'xml'])];

config.server = {
  ...config.server,
  enhanceMiddleware(middleware, metroServer) {
    const bundler = metroServer.getBundler().getBundler();
    const watcher = bundler.getWatcher();

    if (!watcher.__caldavTodoChangeEventPatched) {
      watcher.__caldavTodoChangeEventPatched = true;
      const emit = watcher.emit.bind(watcher);

      watcher.emit = (eventName, event) => {
        if (eventName === "change" && event?.eventsQueue && !event.changes) {
          const rootDir = config.projectRoot ?? __dirname;
          const modifiedFiles = new Map(
            event.eventsQueue.map(({ filePath }) => [path.relative(rootDir, filePath), {}])
          );

          return emit(eventName, {
            rootDir,
            changes: {
              addedFiles: new Map(),
              modifiedFiles,
              removedFiles: new Map(),
            },
          });
        }

        return emit(eventName, event);
      };
    }

    return middleware;
  },
};

module.exports = withNativewind(config, {
  inlineVariables: false,
  globalClassNamePolyfill: false,
});
