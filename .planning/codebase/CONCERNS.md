# Codebase Concerns

**Analysis Date:** 2026-01-21

## Tech Debt

**Generated Type Files:**
- Issue: Large generated type files (2000+ lines) from JSON schemas are checked into version control
- Files: `packages/rum-core/src/rumEvent.types.ts` (2148 lines), `packages/core/src/domain/telemetry/telemetryEvent.types.ts` (926 lines), `packages/rum/src/types/sessionReplay.ts` (991 lines)
- Impact: These files have `/* eslint-disable */` at the top, bypassing all linting rules. Changes to schemas regenerate massive diffs making code review difficult
- Fix approach: Consider generating these at build time rather than checking into source control, or split schemas into smaller logical units

**Old Cookie Migration Code:**
- Issue: Migration code for old cookie format is permanently kept in codebase
- Files: `packages/core/src/domain/session/oldCookiesMigration.ts`
- Impact: Code comment states "This migration should remain in the codebase as long as older versions are available/live", creating indefinite technical debt. Maintains legacy cookie names `_dd`, `_dd_r`, `_dd_l`
- Fix approach: Establish deprecation timeline and removal date for old cookie support after sufficient adoption of new format

**Deprecated API Surface:**
- Issue: Multiple deprecated APIs still exported and maintained
- Files:
  - `packages/rum-slim/src/entries/main.ts` - `RumGlobal` type deprecated in favor of `DatadogRum`
  - `packages/rum-core/src/domain/plugins.ts` - `strategy` option deprecated in favor of `addEvent`
  - `packages/rum-react/src/entries/main.ts` - `ErrorBoundaryProps` and `ErrorBoundaryFallback` renamed
  - `packages/rum/src/entries/internal.ts` - Internal APIs with warning about semver
- Impact: Increased maintenance burden supporting both old and new APIs. Risk of users depending on deprecated features
- Fix approach: Add deprecation warnings with timeline, document migration path, remove in next major version

**TypeScript Type Safety Bypasses:**
- Issue: 225 instances of `@ts-ignore`, `@ts-expect-error`, and eslint disables across 84 files
- Files: Widespread across packages, particularly in test files but also in production code
- Impact: Weakens type safety guarantees. Some legitimate (browser API compatibility), but indicates areas where types don't accurately model reality
- Fix approach: Audit each bypass to determine if it's masking a real type error. Consider using more specific type guards or updating type definitions

**Performance API Polyfills:**
- Issue: Multiple browser capability polyfills maintained for older browser support
- Files:
  - `packages/rum-core/src/domain/view/viewMetrics/interactionCountPolyfill.ts` - Chrome-specific convention for interaction counting
  - `packages/rum-core/src/browser/firstInputPolyfill.ts` - First Input polyfill
  - `packages/rum-react/test/reactOldBrowsersSupport.ts` - TODO comment about removing when browsers support measureOptions
- Impact: Additional code complexity and maintenance burden. Polyfills may have subtle behavior differences from native implementations
- Fix approach: Define minimum supported browser versions and remove polyfills for features universally supported

**Type Coercion Through 'as any':**
- Issue: Extensive use of type assertions to bypass TypeScript checking
- Files: Spread throughout codebase, many instances of `as unknown as Type` patterns
- Impact: Runtime type mismatches not caught at compile time
- Fix approach: Refactor to use proper type guards and discriminated unions

## Known Bugs

**Firefox Worker Error Handling:**
- Symptoms: Deflate worker errors handled differently across browsers
- Files: `packages/rum/src/domain/deflate/deflateWorker.ts` (line 88)
- Trigger: Worker initialization failure - Chromium throws exception, Firefox fires error event
- Workaround: Code handles both patterns. Comment references https://bugzilla.mozilla.org/show_bug.cgi?id=1736865#c2

**Safari CSP Worker Failure:**
- Symptoms: Worker fails under CSP restrictions but doesn't trigger expected logging
- Files: `test/e2e/scenario/transport.scenario.ts` (line 38-41)
- Trigger: Content Security Policy blocks worker in Safari/WebKit
- Workaround: Test marked with `test.fixme` for webkit. Non-deflate requests still sent as fallback

**Edge Viewport Resize Inaccuracy:**
- Symptoms: ViewportResize record data is off by almost 20px in Edge
- Files: `test/e2e/scenario/recorder/viewports.scenario.ts` (line 33)
- Trigger: Viewport resize operations in Microsoft Edge
- Workaround: Test skipped for Edge browser with `test.fixme`

**Session Replay Race Condition:**
- Symptoms: Last segment may not be sent before page unload when using Web Worker
- Files: `test/e2e/lib/framework/flushEvents.ts` (lines 10-23)
- Trigger: Fast page navigation where Worker async communication completes after beforeunload event
- Workaround: E2E tests navigate to `/ok?duration=200` endpoint with delay to allow Worker time to send requests. Comment notes this mainly affects local tests with low latency
- Fix approach: Consider using synchronous Beacon API for final segment or buffering strategy

## Security Considerations

**Data Sanitization:**
- Risk: User-provided data needs careful sanitization before sending to intake
- Files: `packages/core/src/tools/serialisation/sanitize.ts`
- Current mitigation: Comprehensive sanitize function that handles cyclic references, limits size to 220KB, transforms unserializable types. Referenced in `packages/rum-core/src/boot/rumPublicApi.ts`
- Recommendations: Regular security audit of sanitization logic, especially for prototype pollution and XSS vectors

**Internal APIs Exposed:**
- Risk: Internal modules exported with semver warning
- Files: `packages/rum/src/entries/internal.ts`, `packages/rum/src/entries/internalSynthetics.ts`
- Current mitigation: Warning comment states "not intended for public usages, and won't follow semver"
- Recommendations: Separate internal packages or use module boundaries to prevent external consumption

**Console Logging:**
- Risk: 26 instances of console usage in production code (not counting tests)
- Files: `packages/core/src/tools/display.ts`, `packages/core/src/domain/console/consoleObservable.ts`, `packages/logs/src/domain/configuration.ts`
- Current mitigation: Mostly instrumentation of console for monitoring purposes
- Recommendations: Ensure no sensitive data logged. Audit console.log statements that could leak internal state

## Performance Bottlenecks

**Large Type Definition Files:**
- Problem: Parsing and type-checking 2000+ line generated type files
- Files: `packages/rum-core/src/rumEvent.types.ts` (2148 lines)
- Cause: Complex RUM event schema with many union types and nested structures
- Improvement path: Split into smaller interface files imported by main types, or use type generation with imports

**Mutation Batching Complexity:**
- Problem: DOM mutation tracking requires careful throttling to avoid performance impact
- Files: `packages/rum/src/domain/record/mutationBatch.ts`
- Cause: Need to balance between batching mutations (16ms min delay) and not blocking UI (100ms max delay)
- Improvement path: Current implementation uses requestIdleCallback, but may need additional tuning for mutation-heavy SPAs

**Timer and Interval Usage:**
- Problem: Multiple setTimeout/setInterval usages could accumulate
- Files: Spread across 20+ files including `packages/core/src/tools/timer.ts`, session management, transport retry logic
- Cause: Various features need polling or delayed execution
- Improvement path: Audit for proper cleanup in stop() methods. Consider consolidating timers where possible

## Fragile Areas

**Public API Surface (`rumPublicApi.ts`):**
- Files: `packages/rum-core/src/boot/rumPublicApi.ts` (843 lines)
- Why fragile: Central orchestration point for entire RUM SDK. Manages initialization state, lifecycle, context managers. Many edge cases around already-initialized state and race conditions
- Safe modification: Always use existing patterns for adding new methods. Test all initialization paths. Check for proper cleanup in stop/destroy
- Test coverage: Heavy test coverage in `packages/rum-core/src/boot/rumPublicApi.spec.ts` (952 lines) but complex state management

**Configuration Validation:**
- Files: `packages/rum-core/src/domain/configuration/configuration.ts` (553 lines)
- Why fragile: Handles configuration validation, defaults, remote configuration overrides. Many deprecated options maintained for backward compatibility
- Safe modification: Add new config options through existing validation patterns. Always provide defaults. Test with remote configuration enabled
- Test coverage: `packages/rum-core/src/domain/configuration/configuration.spec.ts` (692 lines)

**DOM Mutation Tracking:**
- Files: `packages/rum/src/domain/record/trackers/trackMutation.ts` (262 lines), `packages/rum/src/domain/record/serialization/serializeNode.ts` (211 lines)
- Why fragile: Complex logic for tracking and serializing DOM changes. Must handle shadow DOM, iframes, special element types. Comments mention "race condition" and "timing issue" concerns
- Safe modification: Test extensively across browsers. Watch for memory leaks from retained node references. Verify behavior with MutationObserver timing
- Test coverage: `packages/rum/src/domain/record/trackers/trackMutation.spec.ts` (1218 lines)

**Worker Communication:**
- Files: `packages/rum/src/domain/deflate/deflateWorker.ts`
- Why fragile: Cross-browser worker instantiation differences. CSP restrictions. Async communication timing issues
- Safe modification: Always provide fallback when worker fails. Test CSP scenarios. Handle both exception and error event patterns
- Test coverage: E2E scenarios cover worker failure modes

## Scaling Limits

**Event Size Limits:**
- Current capacity: Single event max 256KB, sanitize defaults to 220KB for user data
- Limit: Large context objects or deeply nested structures hit size limits
- Scaling path: Document size limits prominently. Provide guidance on summarizing large contexts

**Test Suite Size:**
- Current capacity: 221 test spec files in packages directory alone
- Limit: Test execution time growing. E2E tests require BrowserStack or local browser setup
- Scaling path: Parallelize test execution. Consider splitting test suites by feature area. Use test.only/test.skip judiciously (currently no skipped tests found)

**Monorepo Package Count:**
- Current capacity: 10 packages (core, rum, rum-core, rum-react, rum-slim, logs, worker, flagging)
- Limit: Dependency management complexity. Build orchestration with yarn workspaces
- Scaling path: Current structure is reasonable. Consider federation if package count grows significantly

## Dependencies at Risk

**Custom json-schema-to-typescript Fork:**
- Risk: Using fork `bcaudan/json-schema-to-typescript#bcaudan/add-readonly-support`
- Impact: Generates all type definition files. If fork becomes unmaintained, can't update schema generation
- Migration plan: Consider upstreaming readonly support patch to main project or find alternative code generation

**React Router v7 Major Update:**
- Risk: Recently updated to v7 (commit 92971947c)
- Impact: Breaking changes may affect rum-react package router integration
- Migration plan: Monitor for issues in `packages/rum-react/src/domain/reactRouter/` integration code

## Missing Critical Features

**Progressive Loading Type Definitions:**
- Problem: All type definitions loaded together in 2000+ line files
- Blocks: IDE performance in large projects, slow TypeScript compilation
- Priority: Medium - affects developer experience but not runtime

**Worker Fallback Strategy Documentation:**
- Problem: Worker failure modes handled but not well documented
- Blocks: Customer debugging of CSP or worker issues
- Priority: Medium - works in practice but support burden

## Test Coverage Gaps

**Browser Extension Context:**
- What's not tested: Extensive manual testing needed for developer extension
- Files: `developer-extension/` directory has limited automated test coverage
- Risk: Regressions in extension-specific features (panel UI, settings persistence)
- Priority: Medium - extension is developer tool not customer-facing

**Error Boundary Edge Cases:**
- What's not tested: React error boundary with concurrent mode, Suspense boundaries
- Files: `packages/rum-react/src/domain/error/errorBoundary.tsx`
- Risk: Newer React features may interact unexpectedly with error tracking
- Priority: Low - basic error boundary well tested

**Remote Configuration Overrides:**
- What's not tested: All combinations of local config + remote config overrides
- Files: `packages/rum-core/src/domain/configuration/remoteConfiguration.ts`
- Risk: Unexpected behavior when remote config conflicts with local settings
- Priority: High - can affect production monitoring behavior
- Test coverage: Some coverage in `packages/rum-core/src/domain/configuration/remoteConfiguration.spec.ts` (712 lines) but combinatorial explosion of config options

---

*Concerns audit: 2026-01-21*
