const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root for @messy-notes/shared and hoisted dependencies,
// while anchoring Metro's server root to apps/mobile for Android embed builds.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];
config.server = {
  ...config.server,
  unstable_serverRoot: projectRoot,
};

module.exports = config;
