# Multiverse DataDog Browser SDK Fork

This is a fork of the [DataDog Browser SDK](https://github.com/DataDog/browser-sdk) maintained by Multiverse.

## Why This Fork Exists

**Atlas needs to coexist on the same pages as other Multiverse apps, while both utilize DataDog RUM.**

The challenge: When multiple applications on the same page try to use the standard DataDog Browser SDK, they conflict because they all use the same global variables (`window.DD_RUM`, `window.DD_LOGS`) and storage keys (cookies like `_dd_s`).

### The Problem

```javascript
// Scenario: Atlas embedded on a page that already has Ariel's DataDog

// Ariel's DataDog (standard SDK)
window.DD_RUM.init({
  applicationId: 'ariel-app-id',
  service: 'ariel',
})

// Atlas tries to use DataDog too
window.DD_RUM.init({
  applicationId: 'atlas-app-id',
  service: 'atlas',
})
// ❌ This overwrites Ariel's instance!
// ❌ Session tracking gets mixed between the two
// ❌ Data is sent to the wrong application ID
```

### The Solution

This fork renames all DataDog globals to use the `ATLAS_SDK` prefix, allowing Atlas to run its own isolated DataDog instance:

```javascript
// Ariel's DataDog (standard SDK)
window.DD_RUM.init({
  applicationId: 'ariel-app-id',
  service: 'ariel',
})

// Atlas DataDog (this fork)
window.ATLAS_SDK_DD_RUM.init({
  applicationId: 'atlas-app-id',
  service: 'atlas',
})
// ✅ Both instances coexist peacefully
// ✅ Separate session tracking
// ✅ Data goes to correct application IDs
```

## What Was Changed

All DataDog globals and storage keys have been renamed with the `ATLAS_SDK` prefix:

### Globals

- `window.DD_RUM` → `window.ATLAS_SDK_DD_RUM`
- `window.DD_LOGS` → `window.ATLAS_SDK_DD_LOGS`
- `window.DD_RUM_SYNTHETICS` → `window.ATLAS_SDK_DD_RUM_SYNTHETICS`
- `window.DD_SOURCE_CODE_CONTEXT` → `window.ATLAS_SDK_DD_SOURCE_CODE_CONTEXT`
- `window.DatadogEventBridge` → `window.AtlasSDKDatadogEventBridge`

### Storage Keys

- `_dd_s` → `_atlas_sdk_s` (session cookie)
- `_dd_c` → `_atlas_sdk_c` (context storage prefix)
- `_dd_test_` → `_atlas_sdk_test_` (localStorage test)

### Product Keys

- `rum` → `atlas-sdk-rum`
- `logs` → `atlas-sdk-logs`

This ensures complete isolation between Atlas's DataDog instance and any other DataDog instances on the same page.

## Known Limitations

As documented in [DataDog/browser-sdk#2994](https://github.com/DataDog/browser-sdk/issues/2994), some features cannot be fully separated between multiple instances:

1. **Session Replay** - Recording state may have conflicts
2. **Interaction Tracking** - DOM event listeners may double-fire
3. **Uncaught Errors** - Both instances will capture them (use `beforeSend` to filter)

You may need to add filtering in your `beforeSend` hooks to prevent cross-pollution of data.

## Maintaining This Fork

### Prerequisites

**Must be built with Node.js v22+ (we used v25.3.0)**

Check your Node version:

```bash
node --version  # Should be v22.x or higher
```

If you need to switch Node versions:

```bash
nvm use 25.3.0  # or the version specified in package.json
```

### Upgrading from Upstream DataDog

When pulling updates from upstream DataDog:

```bash
# 1. Add upstream if not already added
git remote add upstream https://github.com/DataDog/browser-sdk.git

# 2. Fetch latest from upstream
git fetch upstream

# 3. Merge or rebase
git merge upstream/main
# or
git rebase upstream/main

# 4. Re-apply the global renames (conflicts expected)
# Resolve conflicts, ensuring all DD_* globals become ATLAS_SDK_DD_*

# 5. Test
yarn install
yarn build
yarn test

# 6. Push
git push origin main
```

### Automated Rename (if needed)

The renames follow a consistent pattern. If you need to reapply them after a merge, you can use find/replace:

- `DD_RUM` → `ATLAS_SDK_DD_RUM`
- `DD_LOGS` → `ATLAS_SDK_DD_LOGS`
- `'_dd_s'` → `'_atlas_sdk_s'`
- `'_dd_c'` → `'_atlas_sdk_c'`
- etc.

## Links

- **Upstream Repository:** https://github.com/DataDog/browser-sdk
- **DataDog RUM Documentation:** https://docs.datadoghq.com/real_user_monitoring/browser/
- **Related Issue:** https://github.com/DataDog/browser-sdk/issues/2994
