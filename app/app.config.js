module.exports = ({ config }) => {
  const isDev = process.env.APP_VARIANT === 'development';

  return {
    ...config,
    name: isDev ? 'todo (Dev)' : 'todo',
    ios: {
      ...config.ios,
      bundleIdentifier: isDev ? 'codes.tashhif.tasks.dev' : 'codes.tashhif.tasks',
    },
    android: {
      ...config.android,
      package: isDev ? 'codes.tashhif.tasks.dev' : 'codes.tashhif.tasks',
    },
  };
};
