# Investigation: `undefinedundefined...` Error in Rspack Test Output

## Status: RESOLVED

## Problem Summary

When running `npm run test` (which runs `meteor test --full-app`) **after** running the dev server (`meteor run`), Meteor produces an `app.js` file where the actual rspack bundle code is replaced with ~927,000 concatenated `undefined` strings.

**Error symptom:**
```
ReferenceError: undefinedundefinedundefinedundefined...
```

**Location:** `.meteor/local/build/programs/server/app/app.js` line 189

**Critical observation:** The bug ONLY occurs when running tests after the dev server has been run. Running tests on a clean state (after `meteor reset`) works fine.

## Root Cause Analysis

### The Real Issue: Shared Directory Between Dev and Full-App Tests

In `--full-app` test mode, Meteor needs both:
1. The **main app** (to run the full application)
2. The **test files** (to run tests against the app)

The problem was that both dev mode (`meteor run`) and full-app test mode (`meteor test --full-app`) were using the **same directory** for main bundles: `_build/main-dev/`.

When running tests after dev:
1. Dev mode creates files in `_build/main-dev/` with source maps pointing to dev paths
2. Test mode also needs main module files, and the entry points pointed to `_build/main-dev/`
3. Meteor's ignore patterns correctly ignored `_build/main-dev/**` in test mode
4. But this meant Meteor couldn't find the mainModule it needed!
5. When we didn't ignore it, the linker combined BOTH dev and test files, causing source map corruption

The `SourceNode.fromStringWithSourceMap()` function returns `undefined` for each code chunk when source maps don't align with the actual code.

## Solution

Use a **separate directory** for main bundles when running `--full-app` tests:
- Dev mode: `_build/main-dev/` (unchanged)
- Full-app test mode: `_build/test-main-dev/` (NEW - isolated from dev)
- Unit test mode: `_build/test/` (unchanged)

This allows:
1. Dev server and tests to run **simultaneously** on different ports
2. Ignore patterns to correctly exclude `_build/main-dev/**` in test mode
3. Tests to find their main module files in `_build/test-main-dev/`

### Files Modified

| File | Changes |
|------|---------|
| `packages/rspack/lib/config.js` | Use `isTestMain` for mainModule paths in `--full-app` mode; import `isMeteorAppTestFullApp` |
| `packages/rspack/lib/build-context.js` | Use `isTestMain` for main module file creation in `--full-app` mode |

### Key Code Changes

**config.js:**
```javascript
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
```

**build-context.js:**
```javascript
// In --full-app mode, use isTestMain so main bundles go to test-main-dev/
const isFullApp = isMeteorAppTestFullApp();
const mainModuleType = isFullApp ? { isTestMain: true } : { isMain: true };
```

## Directory Structure (After Fix)

```
_build/
├── main-dev/           # meteor run (dev server)
├── main-prod/          # meteor build (production)
├── test/               # meteor test (unit tests) & meteor test --full-app (test files)
└── test-main-dev/      # meteor test --full-app (main app bundle, isolated from dev)
```

## Verification

1. `meteor reset` (clean state)
2. `meteor run` → Dev server works
3. Stop dev server
4. `npm run test` → Tests pass (no more `undefinedundefined...` error)
5. Can also run both simultaneously on different ports

## Previous Attempts (For Reference)

### Attempt 1: Add `isTestMain` Directory Support
Added `isTestMain` flag to `getBuildFilePath()` - this was the right direction but wasn't being used by the entry point logic.

### Attempt 2: Fix Ignore Patterns
Changed ignore patterns to exclude both `main-dev` and `main-prod` in test mode. This worked correctly but caused Meteor to fail with "Could not find mainModule" because we were ignoring the directory but still pointing entry points to it.

### Attempt 3: Complete Solution
Combined both approaches: use `isTestMain` for entry points AND ignore `main-dev`/`main-prod` in test mode. This creates files in `test-main-dev/` (not ignored) while ignoring `main-dev/` (dev server's directory).
