# Rspack Mode Isolation

## Investigation Summary

When running multiple Meteor instances simultaneously (e.g., `meteor run` and `meteor test --full-app`), they were conflicting due to shared build directories.

### What Was Already Isolated

1. **`_build/` subdirectories**: Entry/output files were already separated:
   - `_build/main-dev/` for development mode
   - `_build/main-prod/` for production mode
   - `_build/test/` for test modes

2. **Dev server ports**: Calculated from Meteor's `PORT` env var, so different app ports result in different rspack dev server ports.

### What Was Shared (The Problem)

1. **`public/build-chunks/`** and **`public/build-assets/`**: Both dev and test modes wrote to the same directories, causing conflicts when running simultaneously.

2. **`cleanBuildContextFiles()`**: Cleaned ALL mode directories regardless of which mode was running, potentially disrupting other running instances.

## Solution Implemented

### Three-Way Mode Isolation

Asset and chunk directories are now mode-specific:

| Mode | Chunks Directory | Assets Directory |
|------|------------------|------------------|
| `meteor run` / `meteor build` | `build-chunks` | `build-assets` |
| `meteor test` | `build-chunks-test` | `build-assets-test` |
| `meteor test --full-app` | `build-chunks-app-test` | `build-assets-app-test` |

### Files Modified

1. **`packages/rspack/lib/constants.js`**
   - Added `getModeSuffix(isTest, isTestFullApp)` helper
   - Added `getRspackChunksContext(isTest, isTestFullApp)` getter
   - Added `getRspackAssetsContext(isTest, isTestFullApp)` getter

2. **`packages/rspack/lib/processes.js`**
   - Updated `getRspackEnv()` to use mode-aware context getters

3. **`packages/rspack/rspack_server.js`**
   - Updated to use mode-aware context getters for request routing

4. **`packages/rspack/lib/build-context.js`**
   - Updated gitignore entries to include all mode suffixes
   - Updated `cleanBuildContextFiles()` to only clean current mode's directories

5. **`tools/tool-env/rspack.js`**
   - Updated `getRspackResourcesContexts()` to return all mode contexts for cleanup

### Directory Structure After Changes

```
public/
├── build-chunks/              # meteor run / meteor build
├── build-chunks-test/         # meteor test
├── build-chunks-app-test/     # meteor test --full-app
├── build-assets/              # meteor run / meteor build
├── build-assets-test/         # meteor test
└── build-assets-app-test/     # meteor test --full-app

_build/
├── main-dev/                  # meteor run (development)
├── main-prod/                 # meteor build (production)
└── test/                      # meteor test (both modes share this)
```

## Backwards Compatibility

- Base constants `RSPACK_CHUNKS_CONTEXT` and `RSPACK_ASSETS_CONTEXT` remain unchanged
- Code using constants directly continues to work (gets base value without suffix)
- Environment variable overrides still work (override the base, suffix still applied)

## Usage

Run multiple instances simultaneously on different ports:

```bash
# Terminal 1: Development server
meteor run --port 3000

# Terminal 2: Unit tests
meteor test --port 3100 --driver-package meteortesting:mocha

# Terminal 3: Full-app integration tests
meteor test --full-app --port 3200 --driver-package meteortesting:mocha
```

All three instances will use separate asset directories and won't interfere with each other.
