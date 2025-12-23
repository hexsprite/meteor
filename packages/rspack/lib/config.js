/**
 * @module config
 * @description Functions for configuring Meteor for Rspack
 */
import { glob } from 'glob';
import path from 'path';
import fs from 'fs';

const { logInfo } = require('meteor/tools-core/lib/log');
const {
  getMeteorAppFilesAndFolders,
  setMeteorAppIgnore,
  setMeteorAppEntrypoints,
  setMeteorAppCustomScriptUrl,
  isMeteorAppDevelopment,
  isMeteorAppRun,
  isMeteorAppBuild,
  isMeteorAppDebug,
  isMeteorAppTest,
  isMeteorAppTestFullApp,
  isMeteorAppConfigModernVerbose,
  isMeteorBlazeProject,
  isMeteorLessProject,
  isMeteorScssProject,
  getMeteorEnvPackageDirs,
  getMeteorAppConfig,
  getMeteorAppDir,
} = require('meteor/tools-core/lib/meteor');
const { buildUnignorePatterns } = require('meteor/tools-core/lib/ignore');

import { getInitialEntrypoints } from './build-context';

const { ensureModuleFilesExist, getBuildFilePath } = require('./build-context');
const { RSPACK_BUILD_CONTEXT, FILE_ROLE } = require('./constants');

/**
 * Checks if entries exist in .meteorignore file
 * @param {string[]} entries - Entries to check
 * @returns {Object} Results with entry keys and boolean values
 */
function checkMeteorIgnoreExactEntries(entries) {
  const meteorIgnorePath = path.join(getMeteorAppDir(), '.meteorignore');
  const results = {};

  // Initialize results object with false for each entry
  entries.forEach(entry => {
    results[entry] = false;
  });

  // Check if .meteorignore file exists
  if (!fs.existsSync(meteorIgnorePath)) {
    return results;
  }

  // Read the .meteorignore file
  try {
    const content = fs.readFileSync(meteorIgnorePath, 'utf8');
    const lines = content.split('\n');

    // Check each line against all entries
    lines.forEach(line => {
      // Skip empty lines and comments
      if (!line.trim() || line.trim().startsWith('#')) {
        return;
      }

      const trimmedLine = line.trim();

      // Check for exact matches
      entries.forEach(entry => {
        if (trimmedLine === entry) {
          results[entry] = true;
        }
      });
    });
  } catch (error) {
    // If there's an error reading the file, return the initialized results
  }

  return results;
}

/**
 * Gets code file extensions to ignore in directories.
 * Uses a fixed list instead of scanning all files (which caused 30KB+ env vars).
 * Excludes extensions that Meteor compilers need to process.
 * @returns {string[]} Array of file extensions to ignore
 */
function getCodeExtensionsToIgnore() {
  // Fixed list of code extensions - no filesystem scanning needed
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json',
    '.map', '.d.ts', '.spec.ts', '.test.ts'
  ];

  // Let Meteor compilers process their files
  const exclude = [];
  if (isMeteorBlazeProject()) exclude.push('.html');
  if (isMeteorLessProject()) exclude.push('.less');
  if (isMeteorScssProject()) exclude.push('.scss');

  return codeExtensions.filter(ext => !exclude.includes(ext));
}

/**
 * Configures Meteor settings for Rspack
 * Sets up file ignores, entry points, and custom script URL
 * Creates necessary module files and writes content to them
 * @returns {void}
 */
export function configureMeteorForRspack() {
  const meteorAppConfig = getMeteorAppConfig();
  const initialEntrypoints = getInitialEntrypoints();

  // Ignore node_modules to prevent Meteor from processing them
  const projectRootFilesAndFolders = getMeteorAppFilesAndFolders({
    recursive: false,
  });

  const initialEntrypointContexts = [
    initialEntrypoints.mainClient,
    initialEntrypoints.mainServer,
  ].map(entrypoint => path.dirname(entrypoint));
  const includedDirs = ['public', 'private', '.meteor', RSPACK_BUILD_CONTEXT];
  const ignoredDirs = projectRootFilesAndFolders.directories.filter(
    dir => !includedDirs.includes(dir),
  );

  const envPackageDirs = getMeteorEnvPackageDirs().map(
    dir => path.normalize(dir)?.split(path.sep)?.filter(Boolean)?.[0],
  );
  let extraFoldersToIgnore = ignoredDirs
      .filter(
        dir =>
          ![
            'public',
            'private',
            '.meteor',
            'packages',
            ...envPackageDirs,
            RSPACK_BUILD_CONTEXT,
          ].includes(dir),
      )
      .map(dir => `${dir}/**`);
  let extraFilesToIgnore = [];

  // For Blaze/Less/SCSS projects, use per-extension patterns so those compilers
  // can still process their files. Uses fixed extension list (not filesystem scan).
  if (isMeteorBlazeProject() || isMeteorLessProject() || isMeteorScssProject()) {
    const extensionsToIgnore = getCodeExtensionsToIgnore();
    // Only apply to top-level ignored dirs, not recursively to all subdirs
    extraFilesToIgnore = extraFoldersToIgnore.flatMap(dirPattern => {
      const dir = dirPattern.replace('/**', '');
      return extensionsToIgnore.map(ext => `${dir}/**/*${ext}`);
    });
    extraFoldersToIgnore = []; // Clear since we're using extension patterns instead
  }

  // Skip CSS/HTML files in entrypoint contexts
  extraFilesToIgnore = [
    ...extraFilesToIgnore,
    ...initialEntrypointContexts.flatMap(entrypoint => {
      const cssPattern = `${entrypoint}/*.css`;
      const htmlPattern = `${entrypoint}/*.html`;

      const cssFiles = glob.sync(cssPattern);
      const htmlFiles = glob.sync(htmlPattern);

      const entriesToCheck = [
        cssPattern,
        htmlPattern,
        ...cssFiles,
        ...htmlFiles
      ];

      const entryResults = checkMeteorIgnoreExactEntries(entriesToCheck);
      const hasMatchingCssPattern = entryResults[cssPattern];
      const hasMatchingHtmlPattern = entryResults[htmlPattern];
      const hasAnyCssFileInMeteorIgnore = cssFiles.some(file => entryResults[file]);
      const hasAnyHtmlFileInMeteorIgnore = htmlFiles.some(file => entryResults[file]);

      const result = [];

      // Handle HTML files
      if (hasAnyHtmlFileInMeteorIgnore) {
        // Add individual HTML files that are not in meteorignore
        htmlFiles.forEach(file => {
          if (!entryResults[file]) {
            result.push(`!${file}`);
          }
        });
      } else if (!hasMatchingHtmlPattern) {
        // Skip HTML pattern if not in meteorignore
        result.push(`!${htmlPattern}`);
      }

      // Handle CSS files
      if (hasAnyCssFileInMeteorIgnore) {
        // Add individual CSS files that are not in meteorignore
        cssFiles.forEach(file => {
          if (!entryResults[file]) {
            result.push(`!${file}`);
          }
        });
      } else if (!hasMatchingCssPattern) {
        // Skip CSS pattern if not in meteorignore
        result.push(`!${cssPattern}`);
      }

      return result;
    }),
  ];

  const testIgnorePath = `${RSPACK_BUILD_CONTEXT}/${path.dirname(
    getBuildFilePath({
      isTest: true,
    }),
  )}/**`;
  // In test mode, ignore BOTH main-dev and main-prod to prevent conflicts
  const mainDevIgnorePath = `${RSPACK_BUILD_CONTEXT}/${path.dirname(
    getBuildFilePath({
      isMain: true,
      isDevelopment: true,
    }),
  )}/**`;
  const mainProdIgnorePath = `${RSPACK_BUILD_CONTEXT}/${path.dirname(
    getBuildFilePath({
      isMain: true,
      isProduction: true,
    }),
  )}/**`;
  // Also ignore test-main directories (main bundle built for --full-app tests)
  const testMainDevIgnorePath = `${RSPACK_BUILD_CONTEXT}/${path.dirname(
    getBuildFilePath({
      isTestMain: true,
      isDevelopment: true,
    }),
  )}/**`;
  const testMainProdIgnorePath = `${RSPACK_BUILD_CONTEXT}/${path.dirname(
    getBuildFilePath({
      isTestMain: true,
      isProduction: true,
    }),
  )}/**`;
  // For non-test mode, ignore the opposite env's main dir
  const otherMainIgnorePath =
    (isMeteorAppDevelopment() && mainProdIgnorePath) || mainDevIgnorePath;
  const foldersToIgnore = [
    ...((isMeteorAppTest() && [mainDevIgnorePath, mainProdIgnorePath]) || [
      testIgnorePath,
      testMainDevIgnorePath,
      testMainProdIgnorePath,
      otherMainIgnorePath,
    ]),
    'node_modules/**',
    ...extraFoldersToIgnore,
  ].filter(Boolean);
  const rootFilesToIgnore = projectRootFilesAndFolders.files.filter(
      file =>
        ![
          'package.json',
          '.meteorignore',
          'tsconfig.json',
          'postcss.config.js',
          'scss-config.json',
        ].includes(file),
    );
  const filesToIgnore = [...rootFilesToIgnore, ...extraFilesToIgnore];
  const unignoredFilesAndFolders = buildUnignorePatterns(
    meteorAppConfig?.modules || [],
    { skipLevel: 1 },
  );
  const meteorAppIgnores = `${foldersToIgnore.join(' ')} ${filesToIgnore.join(
    ' ',
  )} ${unignoredFilesAndFolders.join(' ')}`.trim();

  setMeteorAppIgnore(meteorAppIgnores);

  if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
    logInfo(`[i] Meteor app ignores: ${meteorAppIgnores}`);
  }

  const env = isMeteorAppDevelopment()
    ? { isDevelopment: true }
    : { isProduction: true };
  const commandRole = isMeteorAppRun()
    ? { role: FILE_ROLE.run }
    : isMeteorAppBuild()
    ? { role: FILE_ROLE.build }
    : { role: FILE_ROLE.run };
  // In --full-app test mode, use isTestMain so main bundles go to test-main-dev/
  // instead of main-dev/, avoiding conflicts with the dev server
  const isFullAppTest = isMeteorAppTestFullApp();
  const mainModuleType = isFullAppTest ? { isTestMain: true } : { isMain: true };
  const mainClientModule = getBuildFilePath({
    ...mainModuleType,
    ...env,
    ...commandRole,
    isClient: true,
  });
  const mainServerModule = getBuildFilePath({
    ...mainModuleType,
    ...env,
    ...commandRole,
    isServer: true,
  });

  const isTestEager =
    initialEntrypoints.testModule == null &&
    initialEntrypoints.testClient == null &&
    initialEntrypoints.testServer == null;
  const isTestModule = initialEntrypoints.testModule != null || isTestEager;
  const testClientModule = getBuildFilePath({
    isTest: true,
    ...env,
    ...commandRole,
    isTestModule,
    isClient: true,
  });
  const testServerModule = getBuildFilePath({
    isTest: true,
    ...env,
    ...commandRole,
    isTestModule,
    isServer: true,
  });

  const appEntrypoints = {
    mainClient: `${RSPACK_BUILD_CONTEXT}/${mainClientModule}`,
    mainServer: `${RSPACK_BUILD_CONTEXT}/${mainServerModule}`,
    ...((isTestModule && {
      testClient: `${RSPACK_BUILD_CONTEXT}/${testClientModule}`,
      testServer: `${RSPACK_BUILD_CONTEXT}/${testServerModule}`,
    }) || {
      testClient: `${RSPACK_BUILD_CONTEXT}/${testClientModule}`,
      testServer: `${RSPACK_BUILD_CONTEXT}/${testServerModule}`,
    }),
  };
  // Set entry points in environment variables if they exist
  setMeteorAppEntrypoints(appEntrypoints);

  if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
    logInfo(`[i] App entrypoints: ${JSON.stringify(appEntrypoints, null, 2)}`);
  }

  // Ensure module files exist
  ensureModuleFilesExist();

  // Write content to module files
  if (isMeteorAppRun() && isMeteorAppDevelopment()) {
    const customScriptUrl = `/__rspack__/${getBuildFilePath({
      ...env,
      isMain: true,
      isClient: true,
      role: FILE_ROLE.output,
      onlyFilename: true,
    })}`;
    setMeteorAppCustomScriptUrl(customScriptUrl);

    if (isMeteorAppDebug() || isMeteorAppConfigModernVerbose()) {
      logInfo(`[i] App custom script: ${customScriptUrl}`);
    }
  }
}
