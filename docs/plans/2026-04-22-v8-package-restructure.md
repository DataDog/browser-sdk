# v8 Package Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the *-next packages to match the v8 architecture doc — consolidate packages, move collectors/views/performance to their correct homes, lift context to SDK level, add transport routing, and wire the new module loading flow.

**Architecture:** Three phases. Phase 1 is mechanical file moves (no behavior change). Phase 2 adapts interfaces (context, transport, event naming). Phase 3 adds new capabilities (module entry points, pre-init buffering, resolveModule). Each task leaves the codebase compiling and tests passing.

**Tech Stack:** TypeScript, Yarn workspaces, tsdown, Jasmine/Karma.

---

## Reference

- Architecture doc: `docs/ARCHITECTURE_V8.md`
- Test command: `yarn test:unit --spec <path>`
- Install after package.json changes: `yarn install`

## Current state → Target state

```
CURRENT                              TARGET
───────                              ──────
core-next                    →       core-next (unchanged)
browser-core-next            →       DELETE (merged into browser-sdk)
browser-sdk                  →       browser-sdk (absorbs browser-core-next)
browser-console-next         →       DELETE (moved into browser-sdk)
browser-errors-next          →       DELETE (moved into browser-sdk)
browser-network-next         →       DELETE (moved into browser-sdk)
browser-views-next           →       DELETE (moved into browser-rum-next)
browser-performance-next     →       DELETE (moved into browser-rum-next)
browser-logs-next            →       browser-logs-next (adapted)
browser-rum-next             →       browser-rum-next (absorbs views + perf)
```

---

## Phase 1: Package consolidation (mechanical moves)

These tasks move files without changing behavior. After each task, all tests pass.

### Task 1: Merge browser-core-next into browser-sdk

Move all source files from `browser-core-next/src/` into `browser-sdk/src/`. Update imports throughout.

**Files:**
- Move: `packages/browser-core-next/src/**` → `packages/browser-sdk/src/browser/` (new subdirectory to keep browser-specific I/O separate from orchestration)
- Modify: all files that import from `@datadog/browser-core-next` → import from local paths or new barrel
- Modify: `packages/browser-sdk/package.json` — absorb browser-core-next's dependencies
- Delete: `packages/browser-core-next/`

**Steps:**

1. Create `packages/browser-sdk/src/browser/` directory
2. Copy all source files from `browser-core-next/src/` to `browser-sdk/src/browser/` (preserve directory structure: `domain/session/`, `domain/transport/`)
3. Copy all spec files from `browser-core-next/src/` alongside their source files
4. Add a barrel export: `packages/browser-sdk/src/browser/index.ts` that re-exports everything `browser-core-next/src/index.ts` exported
5. Update `packages/browser-sdk/package.json`:
   - Remove `@datadog/browser-core-next` from dependencies
   - Add any dependencies that were in `browser-core-next/package.json` but not in `browser-sdk/package.json`
6. Find all files that import from `@datadog/browser-core-next` (grep across the entire repo). Update each import:
   - Within `browser-sdk`: change to relative imports (`../browser/...`)
   - In external packages (browser-network-next, browser-logs-next, etc.): if they import from `@datadog/browser-core-next`, they now import from `@datadog/browser-sdk` or the specific subpath
7. Update `tsconfig.base.json` path aliases if any exist for `browser-core-next`
8. Run `yarn install`
9. Run full test suite for all affected packages
10. Delete `packages/browser-core-next/`
11. Commit: `♻️ Merge browser-core-next into browser-sdk`

### Task 2: Move console collector into browser-sdk

**Files:**
- Move: `packages/browser-console-next/src/consoleCollector.ts` → `packages/browser-sdk/src/collectors/consoleCollector.ts`
- Move: `packages/browser-console-next/src/consoleCollector.spec.ts` → `packages/browser-sdk/src/collectors/consoleCollector.spec.ts`
- Modify: `packages/browser-sdk/src/domain/sdk.ts` — update import from `@datadog/browser-console-next/collectors` to local `../collectors/consoleCollector`
- Delete: `packages/browser-console-next/`

**Steps:**

1. Create `packages/browser-sdk/src/collectors/` directory
2. Copy `consoleCollector.ts` and `consoleCollector.spec.ts` into it
3. Create `packages/browser-sdk/src/collectors/index.ts` that re-exports `startConsoleCollection`
4. Update `sdk.ts` import to use local path
5. Update `browser-sdk/package.json` — remove `@datadog/browser-console-next` dependency
6. Run tests: `yarn test:unit --spec packages/browser-sdk/src/collectors/consoleCollector.spec.ts`
7. Delete `packages/browser-console-next/`
8. Run `yarn install`
9. Commit: `♻️ Move console collector into browser-sdk`

### Task 3: Move errors collector into browser-sdk

Same pattern as Task 2 but for `browser-errors-next`.

**Files:**
- Move: `packages/browser-errors-next/src/runtimeErrorCollector.ts` → `packages/browser-sdk/src/collectors/runtimeErrorCollector.ts`
- Move: `packages/browser-errors-next/src/reportCollector.ts` → `packages/browser-sdk/src/collectors/reportCollector.ts`
- Move corresponding spec files
- Update `sdk.ts` imports
- Delete: `packages/browser-errors-next/`

**Steps:** Same as Task 2, adapted for two files.

Commit: `♻️ Move error collectors into browser-sdk`

### Task 4: Move network collector into browser-sdk

Same pattern as Task 2 but for `browser-network-next`. Note: `browser-network-next` imports `isIntakeUrl` from `@datadog/browser-core-next`. After Task 1, that import path changed. Update accordingly.

**Files:**
- Move: `packages/browser-network-next/src/fetchCollector.ts` → `packages/browser-sdk/src/collectors/fetchCollector.ts`
- Move: `packages/browser-network-next/src/xhrCollector.ts` → `packages/browser-sdk/src/collectors/xhrCollector.ts`
- Move corresponding spec files
- Update `sdk.ts` imports
- Delete: `packages/browser-network-next/`

Commit: `♻️ Move network collectors into browser-sdk`

### Task 5: Move views into browser-rum-next

Views (collectors + processor + enricher + types) move from `browser-views-next` into `browser-rum-next`.

**Files:**
- Move: `packages/browser-views-next/src/initialViewCollector.ts` → `packages/browser-rum-next/src/views/initialViewCollector.ts`
- Move: `packages/browser-views-next/src/navigationCollector.ts` → `packages/browser-rum-next/src/views/navigationCollector.ts`
- Move: `packages/browser-views-next/src/navigationEnricher.ts` → `packages/browser-rum-next/src/views/navigationEnricher.ts`
- Move: `packages/browser-views-next/src/types.ts` → `packages/browser-rum-next/src/views/types.ts`
- Move: `packages/browser-views-next/src/domain/processor.ts` → `packages/browser-rum-next/src/views/processor.ts`
- Move: `packages/browser-views-next/src/collectors/index.ts` → `packages/browser-rum-next/src/views/collectors.ts`
- Move all corresponding spec files
- Move: `packages/browser-views-next/src/processor/index.ts` — the Module init logic merges into `packages/browser-rum-next/src/processor/index.ts`

**Steps:**

1. Create `packages/browser-rum-next/src/views/` directory
2. Copy all view source files and spec files
3. Update imports in copied files (change `@datadog/core-next` paths, remove references to `../types` that are now `./types`)
4. Update `browser-rum-next/src/processor/index.ts` to:
   - Start view collectors during init
   - Register navigation enricher
   - Start view processor
   - Include `startView` in the public API
5. Remove the standalone `viewsProcessor` Module — views are now part of `rumProcessor`
6. Update `sdk.ts` — remove `startViewCollectors` import and call (RUM's init handles it now)
7. Update `browser-sdk/src/integration/views.spec.ts` — views are now tested through the RUM module
8. Update `browser-sdk/package.json` — remove `@datadog/browser-views-next` dependency
9. Add `@datadog/browser-rum-next` to `browser-sdk/package.json` if not present
10. Run all view and rum tests
11. Delete `packages/browser-views-next/`
12. Run `yarn install`
13. Commit: `♻️ Move views into browser-rum-next`

### Task 6: Move performance collectors into browser-rum-next

Performance collectors move from `browser-performance-next` into `browser-rum-next`.

**Files:**
- Move: `packages/browser-performance-next/src/resourceTimingCollector.ts` → `packages/browser-rum-next/src/performance/resourceTimingCollector.ts`
- Move: `packages/browser-performance-next/src/longTaskCollector.ts` → `packages/browser-rum-next/src/performance/longTaskCollector.ts`
- Move: `packages/browser-performance-next/src/types.ts` → `packages/browser-rum-next/src/performance/types.ts`
- Move corresponding spec files
- Remove: `packages/browser-rum-next/src/collectors/index.ts` (was re-exporting from browser-performance-next)

**Steps:**

1. Create `packages/browser-rum-next/src/performance/` directory
2. Copy source files and spec files
3. Update `browser-rum-next/src/processor/index.ts` to start performance collectors during init
4. Update `browser-rum-next/src/domain/processor.ts` — import `ResourceTimingEntry` from local `../performance/types` instead of `@datadog/browser-performance-next`
5. Update `sdk.ts` — remove `startPerformanceCollectors` import and call (RUM's init handles it now)
6. Update `browser-sdk/package.json` — remove `@datadog/browser-performance-next` dependency
7. Run all rum and performance tests
8. Delete `packages/browser-performance-next/`
9. Run `yarn install`
10. Commit: `♻️ Move performance collectors into browser-rum-next`

### Task 7: Clean up deleted package references

After Tasks 1–6, several packages are gone. This task catches any remaining references.

**Steps:**

1. Grep the entire repo for:
   - `@datadog/browser-core-next`
   - `@datadog/browser-console-next`
   - `@datadog/browser-errors-next`
   - `@datadog/browser-network-next`
   - `@datadog/browser-views-next`
   - `@datadog/browser-performance-next`
2. Update or remove any remaining references (tsconfig paths, eslint config, build scripts, package.json workspaces, etc.)
3. Run `yarn install` and full test suite
4. Commit: `🔥 Remove all references to deleted packages`

---

## Phase 2: Interface adaptations

These tasks change interfaces and behavior to match the architecture doc.

### Task 8: Lift context managers to SDK level

Currently each module (logs, rum, views) creates its own `ContextManager` for global/user/account. Move them to `createSdk`.

**Files:**
- Modify: `packages/browser-sdk/src/domain/sdk.ts` — create context managers, register `contextEnricher` on `observation:*`, expose `setUser`/`setGlobalContext`/`setAccount` on returned SDK object
- Modify: `packages/browser-logs-next/src/domain/processor.ts` — remove context manager creation and usage. The processor no longer merges context; the SDK enricher does it.
- Modify: `packages/browser-logs-next/src/processor/index.ts` — remove context CRUD from public API
- Modify: `packages/browser-rum-next/src/domain/processor.ts` — same, remove context merging
- Modify: `packages/browser-rum-next/src/processor/index.ts` — remove context CRUD from public API
- Create: `packages/core-next/src/domain/enricher/contextEnricher.ts` — enricher that stamps global/user/account context from shared context managers
- Update all affected tests

**Steps:**

1. Create `contextEnricher` in core-next with tests
2. Update `createSdk` to create three `ContextManager` instances and register `contextEnricher` on `observation:*`
3. Add `setUser`, `getUser`, `clearUser`, `setGlobalContext`, etc. to the SDK return object
4. Remove context managers from logs processor and its module init
5. Remove context managers from rum processor and its module init (including views processor)
6. Remove context CRUD methods from logs and rum public APIs
7. Update all tests
8. Commit: `♻️ Lift context managers to SDK level`

### Task 9: Rename observation events (drop rum_ prefix)

Change `observation:rum_resource` → `observation:resource`, `observation:rum_error` → `observation:error`, `observation:rum_long_task` → `observation:long_task`.

**Files:**
- Modify: `packages/core-next/src/domain/pipeline/events.ts` — rename types in SdkEventMap
- Modify: `packages/browser-rum-next/src/domain/processor.ts` — update `pipeline.publish()` calls
- Modify: `packages/browser-sdk/src/domain/sdk.ts` — update routing subscribers
- Modify: all spec files that reference old names

**Steps:**

1. Update SdkEventMap
2. Update RUM processor publish calls
3. Update sdk.ts routing (the `observation:rum_*` subscriber becomes individual subscribers for `observation:resource`, `observation:error`, `observation:long_task`)
4. Update all tests
5. Commit: `♻️ Rename observation events: drop rum_ prefix`

### Task 10: Add Transport with route() mechanism

Replace the inline batch/routing logic in `sdk.ts` with a `Transport` class that modules register routes with.

**Files:**
- Create: `packages/core-next/src/domain/transport/router.ts` — `TransportRouter` class with `route(eventType, trackType)` and `start(pipeline)` methods
- Create: `packages/core-next/src/domain/transport/router.spec.ts`
- Modify: `packages/browser-sdk/src/domain/sdk.ts` — replace inline batch/routing logic with `TransportRouter`
- Modify: `packages/core-next/src/domain/module/index.ts` — add `transport` to `ModuleContext`
- Modify: `packages/browser-logs-next/src/processor/index.ts` — call `transport.route('observation:log', 'logs')` during init
- Modify: `packages/browser-rum-next/src/processor/index.ts` — call `transport.route()` for view/resource/error/long_task during init

**Steps:**

1. Implement `TransportRouter` with tests
2. Update `ModuleContext` to include transport
3. Update `createSdk` to create router, pass to modules, wire flush triggers
4. Update logs module to register its route
5. Update rum module to register its routes
6. Remove inline routing from `sdk.ts`
7. Run full test suite
8. Commit: `✨ Add TransportRouter with module-driven route registration`

---

## Phase 3: New capabilities

These tasks add the new module loading flow from the architecture doc.

### Task 11: Add extension entry points per module

Each module gets an `/extension` entry point containing just the config validation. `browser-sdk` bundles them.

**Files:**
- Create: `packages/browser-logs-next/src/extension/index.ts` — exports `logsExtension`
- Create: `packages/browser-rum-next/src/extension/index.ts` — exports `rumExtension`
- Modify: `packages/browser-logs-next/package.json` — add `./extension` export
- Modify: `packages/browser-rum-next/package.json` — add `./extension` export
- Modify: `packages/browser-logs-next/tsdown.config.ts` — add `extension` entry
- Modify: `packages/browser-rum-next/tsdown.config.ts` — add `extension` entry
- Modify: `packages/browser-sdk/package.json` — add dependencies on both modules (for extensions)
- Modify: `packages/browser-sdk/src/domain/sdk.ts` — import extensions from module packages instead of receiving them via init

**Steps:**

1. Extract `logsExtension` from `browser-logs-next/src/domain/configuration.ts` into `browser-logs-next/src/extension/index.ts`
2. Extract `rumExtension` from `browser-rum-next/src/domain/configuration.ts` into `browser-rum-next/src/extension/index.ts`
3. Add export paths to package.json and tsdown.config for both modules
4. Update `browser-sdk` to import extensions directly
5. Run tests, commit: `📦 Add extension entry points for logs and rum modules`

### Task 12: Add public API bridges with pre-init buffering

Each module's default entry point becomes a lightweight bridge that buffers events before `init()` and publishes to the pipeline after.

**Files:**
- Rewrite: `packages/browser-logs-next/src/index.ts` — `datadogLogs` bridge object with local buffer
- Rewrite: `packages/browser-rum-next/src/index.ts` — `datadogRum` bridge object with local buffer
- Create: `packages/core-next/src/domain/registry/bridge.ts` — shared bridge/connect mechanism
- Modify: `packages/browser-sdk/src/domain/sdk.ts` — during init, call `connect(pipeline)` on all registered bridges

**Steps:**

1. Add `registerBridge(name, bridge)` and `connectBridges(pipeline)` to the SDK registry in core-next
2. Implement `datadogLogs` bridge in `browser-logs-next/src/index.ts`:
   - Exports `datadogLogs` with `logger` property that publishes `action:log` events
   - Buffers events in a local array before `connect()` is called
   - Registers itself in the registry at import time
3. Implement `datadogRum` bridge in `browser-rum-next/src/index.ts`:
   - Exports `datadogRum` with `startView`, `addAction`, `addError` methods
   - Same buffering pattern
4. Update `createSdk` to call `connectBridges(pipeline)` after pipeline creation
5. Add tests for buffering behavior
6. Commit: `✨ Add public API bridges with pre-init buffering`

### Task 13: Add resolveModule mechanism

`createSdk` accepts a `resolveModule` function. Module processors are loaded asynchronously.

**Files:**
- Modify: `packages/browser-sdk/src/domain/sdk.ts` — accept `resolveModule` param, use it to load processors async, seal pipeline after all modules load or fail
- Create: `packages/browser-sdk/src/boot/npm.ts` — npm entry point with `import()`-based resolver
- Create: `packages/browser-sdk/src/boot/cdn.ts` — CDN entry point with script-loading resolver

**Steps:**

1. Add `resolveModule` to `createSdk` options
2. After creating pipeline and connecting bridges, call `resolveModule(name)` for each detected config key
3. `Promise.allSettled()` all module loads. For each success, call `module.init(context)`. For each failure, report to telemetry.
4. After all settled, `pipeline.seal()`
5. Create npm entry (`boot/npm.ts`) that wires `resolveModule` to dynamic `import()`
6. Create CDN entry (`boot/cdn.ts`) that wires `resolveModule` to script loading from versioned CDN URLs
7. Add tests for async loading, failure handling
8. Commit: `✨ Add resolveModule for async module loading`

### Task 14: Update SDK public API

`init()`, `setUser`, `setGlobalContext`, `setAccount` are exported from `browser-sdk`. CDN build sets `window.DD`.

**Files:**
- Modify: `packages/browser-sdk/src/index.ts` — export `init`, `setUser`, `setGlobalContext`, `setAccount`
- Modify: `packages/browser-sdk/src/boot/cdn.ts` — set `window.DD` with all SDK functions + module namespaces

**Steps:**

1. Update `browser-sdk/src/index.ts` to export SDK-level functions
2. Update CDN entry to populate `window.DD`
3. Add tests
4. Commit: `✨ Export SDK public API from browser-sdk`

---

## Task dependency graph

```
Phase 1 (sequential — each modifies shared files):
  Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7

Phase 2 (sequential — builds on Phase 1):
  Task 8 → Task 9 → Task 10

Phase 3 (sequential — builds on Phase 2):
  Task 11 → Task 12 → Task 13 → Task 14
```

All tasks are sequential because they share files (sdk.ts, package.json, etc.). Each leaves the codebase in a working state with all tests passing.

## Verification

After each task:
```bash
yarn install
yarn test:unit --spec <affected spec files>
```

After Phase 1 complete:
```bash
# Run ALL *-next tests to verify nothing broke
yarn test:unit --spec packages/core-next/ --spec packages/browser-sdk/ --spec packages/browser-logs-next/ --spec packages/browser-rum-next/
```

After Phase 3 complete:
```bash
yarn typecheck
yarn lint
# Full test suite
```
