# Codebase Concerns

**Analysis Date:** 2026-02-16

## Tech Debt

**Next-Major Deferred Cleanup (10 items):**
- Issue: Ten `TODO next major` or `TODO(next-major)` comments defer breaking changes to the next major version. These accumulate complexity and make each option harder to remove.
- Files:
  - `packages/rum-core/src/domain/configuration/configuration.ts:186` - `enablePrivacyForActionName` should become the default
  - `packages/rum-core/src/boot/preStartRum.ts:68` - Remove `globalContextManager`, `userContextManager`, `accountContextManager` from pre-start strategy
  - `packages/rum-core/src/boot/rumPublicApi.ts:614` - Remove `strategy` from plugin `onRumStart` callback
  - `packages/rum-core/src/boot/rumPublicApi.ts:724` - Decide on relative time support for `addTiming`
  - `packages/rum-core/src/browser/performanceObservable.ts:241` - Remove performance entry fallback
  - `packages/core/src/domain/configuration/configuration.ts:255` - Remove `internalAnalyticsSubdomain` option, replace with `proxyFn`
  - `packages/core/src/browser/fetchObservable.ts:46` - Remove "WAIT" action when `trackEarlyRequests` is removed
  - `packages/core/src/tools/readBytesFromStream.ts:6` - Always collect stream body when `trackEarlyRequests` is removed
  - `packages/logs/src/boot/preStartLogs.ts:42` - Same context manager cleanup as rum-core
  - `packages/rum-react/test/reactOldBrowsersSupport.ts:5` - Bump browser targets for `measureOptions`
- Impact: Increasing configuration surface area with deprecated options that cannot be safely removed until the next major. Makes the init path harder to reason about.
- Fix approach: Track all items in a v7 migration document. Group them for a single coordinated major version bump.

**Generated Type Files Checked Into Source:**
- Issue: Large auto-generated type files (2000+ lines) from JSON schemas committed to version control with `/* eslint-disable */`
- Files: `packages/rum-core/src/rumEvent.types.ts` (2184 lines), `packages/core/src/domain/telemetry/telemetryEvent.types.ts` (942 lines), `packages/rum/src/types/sessionReplay.ts` (991 lines)
- Impact: Massive diffs on schema changes, no linting on generated code, IDE performance degradation when these files are open
- Fix approach: Generate at build time rather than checking in, or split schemas into smaller logical units

**Flagging Package is a Stub:**
- Issue: `packages/flagging` is a placeholder with zero implementation and a hardcoded `console.log`
- Files: `packages/flagging/src/hello.ts` (entire file is a TODO), `packages/flagging/src/entries/main.ts`
- Impact: Workspace overhead for a non-functional package. Dependency version (`@datadog/browser-core: 6.22.0`) is stale vs. the monorepo version (`6.27.1`), indicating it is not maintained alongside other packages.
- Fix approach: Either implement the feature or remove the package from the workspace until it is ready

**Old Cookie Migration Code:**
- Issue: Migration code for legacy cookie format (`_dd`, `_dd_r`, `_dd_l`) permanently kept with comment: "This migration should remain in the codebase as long as older versions are available/live"
- Files: `packages/core/src/domain/session/oldCookiesMigration.ts` (42 lines), called from `packages/core/src/domain/session/storeStrategies/sessionInCookie.ts`
- Impact: Indefinite technical debt with no expiration date. Runs on every cookie-based session initialization.
- Fix approach: Define a migration cutoff version (e.g., only support migrations from v5+). Add a `monitor-until` deadline.

**Deprecated APIs Still Maintained:**
- Issue: Multiple deprecated types and methods remain exported
- Files:
  - `packages/rum/src/entries/main.ts:35` - `RumGlobal` deprecated for `DatadogRum`
  - `packages/rum-slim/src/entries/main.ts:24` - Same deprecation
  - `packages/logs/src/entries/main.ts:29` - `LogsGlobal` deprecated for `DatadogLogs`
  - `packages/core/src/tools/boundedBuffer.ts:6-19` - `BoundedBuffer` deprecated for `BufferedObservable`
  - `packages/core/src/domain/configuration/configuration.ts:106` - `allowFallbackToLocalStorage` deprecated for `sessionPersistence: 'local-storage'`
  - `packages/rum-core/src/boot/rumPublicApi.ts:280-283` - `setUser` without required `id` deprecated
- Impact: Increases API surface, documentation burden, and test maintenance
- Fix approach: Batch-remove all deprecated APIs in the v7 major release

**Module-Level Mutable State (Global Singletons):**
- Issue: At least 16 `let` declarations at module scope in `packages/core/src/` create shared mutable state
- Files:
  - `packages/core/src/tools/experimentalFeatures.ts:28` - `enabledExperimentalFeatures` singleton shared between RUM and Logs
  - `packages/core/src/domain/telemetry/telemetry.ts:79` - `telemetryObservable` module-level variable
  - `packages/core/src/tools/monitor.ts:3-4` - `onMonitorErrorCollected` and `debugMode` globals
  - `packages/core/src/tools/valueHistory.ts:33-35` - `cleanupHistoriesInterval` and `cleanupTasks` globals
  - `packages/core/src/tools/utils/timeUtils.ts:102` - `navigationStart` cache
- Impact: Shared state between RUM and Logs products when used via NPM can cause unexpected cross-product side effects. Makes testing harder (requires explicit reset functions). Comment in `experimentalFeatures.ts` acknowledges: "an experimental flag set on the RUM product will be set on the Logs product."
- Fix approach: Move shared state into an initialization context object passed through the call chain. Short-term: document all singletons and their cross-product implications.

## Known Bugs

**Session Replay Serialization Privacy Bugs (3 documented):**
- Symptoms: Incorrect masking/unmasking behavior for certain form input types
- Files: `packages/rum/src/domain/record/serialization/serializeAttributes.spec.ts`
  - Line 101: `<img alt="value">` treated as `maskable-image` instead of `maskable` ("TODO: This is a bug!")
  - Line 137: `<input type="color">` has inconsistent `maskUnlessAllowlisted` behavior ("TODO: This is almost certainly a bug")
  - Line 173: `<input type="file">` falls back to DOM attribute value when `HTMLInputElement#value` is falsy ("TODO: This is a bug!")
- Trigger: Elements with the above types are serialized for Session Replay under various privacy levels
- Workaround: Tests document the incorrect behavior and treat it as expected for now

**Firefox Worker Error Handling:**
- Symptoms: Deflate worker errors handled differently across browsers
- Files: `packages/rum/src/domain/deflate/deflateWorker.ts`
- Trigger: Worker initialization failure - Chromium throws exception, Firefox fires error event
- Workaround: Code handles both patterns. Comment references https://bugzilla.mozilla.org/show_bug.cgi?id=1736865#c2

**Session Replay Race Condition on Page Unload:**
- Symptoms: Last segment may not be sent before page unload when using Web Worker
- Files: `test/e2e/lib/framework/flushEvents.ts` (lines 10-23)
- Trigger: Fast page navigation where Worker async communication completes after beforeunload event
- Workaround: E2E tests use a delayed endpoint (`/ok?duration=200`) to allow Worker time to send requests

**Privacy CSS Element Order Not Preserved:**
- Symptoms: When ignoring `<script>`, `<link>`, or `<meta>` elements, CSS element order is not preserved in the replay
- Files: `packages/rum-core/src/domain/privacy.ts:265`
- Trigger: Pages with style elements interspersed with ignored elements
- Workaround: None documented. Comment: "TODO: Preserve CSS element order, and record the presence of the tag, just don't render"

## Security Considerations

**Public API Accepts `any` Types:**
- Risk: Several public API methods accept `any` for keys and values, bypassing TypeScript type checking at the integration boundary
- Files: `packages/rum-core/src/boot/rumPublicApi.ts`
  - Lines 246, 255: `setGlobalContextProperty(key: any, value: any)`, `removeGlobalContextProperty(key: any)`
  - Lines 304, 313: `setUserProperty(key: any, property: any)`, `removeUserProperty(key: any)`
  - Line 395: `addFeatureFlagEvaluation(key: string, value: any)`
- Current mitigation: All values go through `sanitize()` before processing
- Recommendations: Use `string` for keys and `unknown` for values to force explicit type narrowing

**Internal APIs Exposed Without Isolation:**
- Risk: Internal modules exported with only a JSDoc warning
- Files: `packages/rum/src/entries/internal.ts`, `packages/rum/src/entries/internalSynthetics.ts`
- Current mitigation: Warning comment states "not intended for public usages, and won't follow semver"
- Recommendations: Use package entry points or `@internal` TypeScript annotations to make these harder to accidentally consume

**Session Replay Data URL Size Limit:**
- Risk: Temporarily bumped data URL attribute limit to 1MB
- Files: `packages/rum/src/domain/record/serialization/serializeAttribute.ts:13`
- Current mitigation: Comment: "TODO: temporarily bump the Session Replay limit to 1Mb for dataUrls. This limit should be removed after [PANA-2843] is implemented"
- Recommendations: Track PANA-2843 completion and restore the original limit

**Zone.js Workaround Uses `as any` Cast:**
- Risk: `getZoneJsOriginalValue` accesses hidden properties via `(target as any)[Zone.__symbol__(name)]`
- Files: `packages/core/src/tools/getZoneJsOriginalValue.ts:32`
- Current mitigation: Function is well-documented and handles missing properties gracefully
- Recommendations: Acceptable trade-off for Zone.js compatibility, but monitor for Zone.js API changes

## Performance Bottlenecks

**Recursive Privacy Level Computation:**
- Problem: `getNodePrivacyLevel` recursively walks ancestor nodes to compute privacy level
- Files: `packages/rum-core/src/domain/privacy.ts:21-38`
- Cause: Each call traverses from the node to the root unless a cache is provided. Cache is per-mutation-batch, not persistent.
- Improvement path: The optional `NodePrivacyLevelCache` mitigates this, but cache lifetime is limited to individual mutation batches. Consider a persistent cache invalidated on privacy attribute changes.

**Request Registry Linear Scan:**
- Problem: `getMatchingRequest` iterates over all buffered requests to find a match
- Files: `packages/rum-core/src/domain/resource/requestRegistry.ts:30-45`
- Cause: Linear scan with `MAX_REQUESTS = 1000` upper bound. For each performance resource entry, all buffered requests are checked.
- Improvement path: Index requests by URL for O(1) lookup instead of O(n) scan

**Sampler BigInt Fallback for Older Browsers:**
- Problem: Browsers without BigInt support fall back to non-deterministic `performDraw` instead of consistent sampling
- Files: `packages/rum-core/src/domain/sampler/sampler.ts:22-29`
- Cause: BigInt required for Knuth factor sampling algorithm
- Improvement path: Comment says "remove this when all browsers we support have BigInt support." Track browser support matrix and set a removal date.

**Mutation Batching Timing Sensitivity:**
- Problem: DOM mutation tracking batches mutations with requestIdleCallback but has strict timing constraints (16ms min, 100ms max)
- Files: `packages/rum/src/domain/record/mutationBatch.ts`, `packages/rum/src/domain/record/trackers/trackMutation.ts` (420 lines)
- Cause: Balance between UI responsiveness and data completeness for Session Replay
- Improvement path: Monitor mutation processing time via telemetry. Consider adaptive batching for mutation-heavy SPAs.

**View Keep-Alive Session Polling:**
- Problem: Every 5 minutes per view, plus session store polling every 1 second
- Files: `packages/rum-core/src/domain/view/trackViews.ts:89` (`SESSION_KEEP_ALIVE_INTERVAL`), `packages/core/src/domain/session/sessionStore.ts:40` (`STORAGE_POLL_DELAY`)
- Cause: Keep session alive during user activity and detect cross-tab session changes
- Improvement path: Current implementation is reasonable, but long-running SPAs with many views accumulate timers. The `KEEP_TRACKING_AFTER_VIEW_DELAY` (5 min) helps, but active views are never pruned.

## Fragile Areas

**Public API Orchestration (`rumPublicApi.ts`):**
- Files: `packages/rum-core/src/boot/rumPublicApi.ts` (905 lines)
- Why fragile: Central orchestration point. Manages pre-start buffering strategy that switches to post-start strategy via mutable `strategy` variable. Complex state machine with consent, initialization, manual view tracking, and remote configuration paths.
- Safe modification: Follow existing `monitor()` or `callMonitored()` wrapping patterns for new methods. Test all initialization permutations (consent before/after init, manual views, Synthetics injection, event bridge).
- Test coverage: `packages/rum-core/src/boot/rumPublicApi.spec.ts` (1027 lines)

**Pre-Start Strategy Buffering:**
- Files: `packages/rum-core/src/boot/preStartRum.ts` (332 lines)
- Why fragile: Buffers all API calls before SDK initialization. Must maintain context managers, handle remote configuration fetch, and coordinate tracking consent. The `tryStartRum` function has multiple preconditions that must all be met.
- Safe modification: New buffered methods must capture clock state at call time, not drain time. Always add `bufferApiCalls.add()` wrapping.
- Test coverage: `packages/rum-core/src/boot/preStartRum.spec.ts` (873 lines)

**Session Store Cross-Tab Synchronization:**
- Files: `packages/core/src/domain/session/sessionStore.ts` (284 lines)
- Why fragile: Polling-based cross-tab session synchronization with multiple state transitions (not-started, tracked, not-tracked, expired). Throttled expand/renew operations can race with expiration.
- Safe modification: Always use `processSessionStoreOperations` for atomic read-modify-write. Never directly mutate session state.
- Test coverage: `packages/core/src/domain/session/sessionStore.spec.ts` (731 lines)

**DOM Mutation Tracking:**
- Files: `packages/rum/src/domain/record/trackers/trackMutation.ts` (420 lines)
- Why fragile: Topological sorting of mutations, shadow DOM traversal, privacy-level filtering, and node ID management. The `processChildListMutations` function has complex logic for detecting moved vs. added vs. removed nodes.
- Safe modification: Test extensively with shadow DOM scenarios. Verify node ID assignment and cleanup. Check memory leaks for retained node references.
- Test coverage: `packages/rum/src/domain/record/trackers/trackMutation.spec.ts` (1218 lines)

**Action Name Extraction:**
- Files: `packages/rum-core/src/domain/action/getActionNameFromElement.ts` (356 lines)
- Why fragile: Multiple strategy layers (programmatic, priority, fallback) with DOM tree traversal up to 10 parent levels. Privacy-level interplay determines whether masking or extraction occurs. Experimental `USE_TREE_WALKER_FOR_ACTION_NAME` feature flag adds a parallel code path.
- Safe modification: Test against diverse real-world HTML patterns. Keep strategy layers independent. The experimental tree walker should be fully tested before becoming default.
- Test coverage: `packages/rum-core/src/domain/action/getActionNameFromElement.spec.ts` (1016 lines)

## Scaling Limits

**Event Size Limits:**
- Current capacity: Single event max ~256KB, user data sanitized at 220KB
- Limit: Large context objects or deeply nested structures hit size limits silently (truncated)
- Scaling path: Document limits prominently. Consider telemetry for events hitting size boundaries.

**Experimental Feature Flags (9 active):**
- Current capacity: 9 flags in `packages/core/src/tools/experimentalFeatures.ts`
- Limit: Combinatorial explosion of feature flag interactions makes testing all paths impractical
- Scaling path: Establish lifecycle for experimental features: promote to default, remove, or expire. Currently no expiration mechanism.

**Monitor-Until Telemetry Deadlines:**
- Current items: 12 `monitor-until` comments, 5 set to "forever"
- Files: `packages/core/src/domain/session/sessionManager.ts:195`, `packages/rum/src/boot/startRecording.ts:26`, `packages/logs/src/domain/reportError.ts:17`, `packages/rum-core/src/transport/formDataTransport.ts:35`, `packages/rum-core/src/domain/startCustomerDataTelemetry.ts:61`
- Limit: "Forever" telemetry items never get cleaned up, accumulating telemetry processing overhead
- Scaling path: Replace "forever" with concrete review dates. The time-bounded ones (2026-04-01, 2026-06-01, 2026-07-01) are well-managed.

## Dependencies at Risk

**Custom json-schema-to-typescript Fork:**
- Risk: Using fork `bcaudan/json-schema-to-typescript#bcaudan/add-readonly-support` (referenced in root `package.json:77`)
- Impact: All type definition files depend on this fork's code generation. If the fork is abandoned, schema type generation breaks.
- Migration plan: Upstream the readonly support patch to the main `json-schema-to-typescript` project, or vendor the fork.

**Karma Test Runner (v6):**
- Risk: Karma has been deprecated (announced end-of-life). The project uses `karma: 6.4.4` with `jasmine-core: 3.99.1`.
- Impact: No security patches or new features. Browser launcher compatibility may break with future browser versions.
- Migration plan: Migrate to Vitest or Jest with browser-mode, or use Playwright for component testing. This is a significant effort given the 221 spec files.

**Jasmine 3.x:**
- Risk: Using `jasmine-core: 3.99.1` and `@types/jasmine: 3.10.19`. Jasmine 3.x is superseded by 5.x.
- Impact: Missing modern features (async matchers, improved error messages). `@types/jasmine` 3.x may not cover newer patterns.
- Migration plan: Upgrade Jasmine alongside or after Karma migration.

## Missing Critical Features

**No Automated Spec Coverage Enforcement:**
- Problem: No tooling to ensure every source file has a corresponding `.spec.ts` file. Of ~301 non-type, non-index source files, many lack co-located specs. The `packages/flagging/` package has zero spec files.
- Blocks: Regressions can be introduced in untested files without CI catching it
- Priority: Medium - the project has good overall coverage in critical paths, but gaps exist in newer/peripheral code

**No Error Boundary for React 18+ Concurrent Mode:**
- Problem: React error boundary implementation uses class component pattern without concurrent mode testing
- Files: `packages/rum-react/src/domain/error/errorBoundary.ts`
- Blocks: Correct error tracking in applications using React concurrent features
- Priority: Low - basic error boundary works; edge cases with Suspense are undocumented

## Test Coverage Gaps

**Flagging Package:**
- What's not tested: Entire package has zero spec files
- Files: `packages/flagging/src/hello.ts`, `packages/flagging/src/entries/main.ts`
- Risk: Package is a stub, but if implementation begins without test infrastructure, regressions are likely
- Priority: Low (stub), but becomes High when implementation begins

**Session Replay Privacy Edge Cases:**
- What's not tested: Multiple documented bugs in serialization tests are marked as known-incorrect behavior
- Files: `packages/rum/src/domain/record/serialization/serializeAttributes.spec.ts` (lines 64-75, 101, 137, 173)
- Risk: Privacy violations where data that should be masked is not masked (e.g., `<input type="file">` value leakage)
- Priority: High - privacy bugs could expose user data in Session Replay

**Click Chain Memory Management:**
- What's not tested: Long-running SPA scenarios with rapid click accumulation
- Files: `packages/rum-core/src/domain/action/trackClickActions.ts:98-102`
- Risk: Comment documents a specific memory leak fix (clearing `currentClickChain` reference in finalize callback). Regression could re-introduce the leak.
- Priority: Medium - manually verified but no long-running leak test

**Remote Configuration + Local Config Combinations:**
- What's not tested: Full matrix of remote configuration overrides interacting with local configuration values
- Files: `packages/rum-core/src/domain/configuration/remoteConfiguration.ts` (302 lines)
- Risk: `SUPPORTED_FIELDS` list (12 fields) creates a large interaction surface between remote and local config
- Priority: High - can affect production monitoring behavior silently
- Test coverage: `packages/rum-core/src/domain/configuration/remoteConfiguration.spec.ts` (712 lines) covers happy paths

**Browser Extension:**
- What's not tested: `developer-extension/` directory has no automated unit test coverage
- Files: `developer-extension/src/` (background, content-scripts, devtools, panel)
- Risk: Regressions in extension UI and DevTools integration go undetected
- Priority: Low - developer tool, not customer-facing production code

---

*Concerns audit: 2026-02-16*
