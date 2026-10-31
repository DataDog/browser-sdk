# Early RUM Error Buffer Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture early RUM runtime errors with a small synchronous script and adopt them without changing RawError processing.

**Architecture:** browser-rum-core consumes browser-rum-buffer, which depends on browser-core. Core accepts an optional runtime-error source; Logs retains its default source. The early source remains live after its history transfers to core.

**Tech Stack:** TypeScript, Yarn workspaces, Webpack, Jasmine/Karma.

**Spec:** docs/superpowers/specs/2026-10-29-early-rum-error-buffer-design.md (approved).

## Global Constraints

RUM only; no early console/fetch/XHR capture. Existing utility locations and RawError construction stay unchanged. Bounded 500-entry history, compatible structural global protocol, no new public RUM option. Do not publish or deploy.

## Review Focus

- Replay/live transition must not duplicate or drop errors.
- Repeated or late script execution must not install another collector.
- Unsupported handles must not block SDK startup.
- RUM initialization/consent timing and Logs default capture must remain intact.
- A separately bundled source must work without shared class or module identity.

### Task 1: Core injection

- [x] Add a structural BufferedDataSource to domain/bufferedData.ts with observable.subscribe, unbuffer, and stop.
- [x] Add tests for pre-buffered replay, source identity, and cleanup without creating a default collector.
- [x] Let startBufferingData optionally subscribe to the source and unbuffer it after subscribing; preserve defaults.
- [x] Run core buffering specs.

### Task 2: Package and RUM integration

- [x] Add browser-rum-buffer package with module and standalone entries and getOrCreateRumBuffer.
- [x] Cover bounded history, adoption, live capture, stop, duplicate/late execution, incompatible handles, and error/rejection routing in specs.
- [x] Use versioned structural global handle checks; retain stopped marker and make stop idempotent.
- [x] Inject source in makeRumPublicApi and register test cleanup for global state.
- [x] Register workspace dependency, TypeScript paths, bundle-size and deployment artifacts. Document installation and matching-version requirement.
- [x] Build packages, run focused unit/integration tests, lint, formatting and typechecks.

### Task 3: Built-artifact verification and review

- [x] Exercise standalone plus RUM bundles in Chrome with errors before and after SDK/init, and inspect emitted errors.
- [x] Measure bundle sizes and verify excluded collectors are absent.
- [x] Request independent review, address material findings, and record evidence below.

## Execution decisions

Work on the existing aymeric/early-datacollection-package branch. Keep changes uncommitted for review. Full typecheck has a known unrelated blocker: missing generated files in the untracked rum-events-format directory.

## Results

- Built browser-core, browser-rum-buffer (modules and CDN), browser-rum-core modules, and browser-rum-slim CDN.
- 142 focused Jasmine/Karma tests passed, including unchanged Logs behavior and diagnostic adoption.
- 11 deployment/source-map script tests passed.
- Headless Chrome with independent CDN bundles verified real exceptions/rejections before SDK evaluation, pre-init and live errors exactly once, original timestamps, duplicate/late scripts, early console exclusion, diagnostic forwarding, and parsing before the SDK loads.
- Final standalone bundle: 11,471 bytes minified / 4,680 bytes gzip (268 gzip bytes over the original spike). Source map excludes fetch/XHR/console collectors and transport.
- Affected-file lint and formatting pass; existing expired monitor-until comment remains a warning.
- Standard yarn typecheck reports only pre-existing missing generated imports in the untracked rum-events-format directory.
- Independent review identified an orphaned diagnostic sink in separate bundles. Added adoption callbacks, same-module loop guards, cleanup, and tests; follow-up review found no further material issues.
- Changes remain uncommitted and unpublished.

## Extensible source contract

User requested that the source support future buffered event types. BufferedDataSource now carries the existing discriminated BufferedData union and declares its collected types. Core forwards those entries and lazily starts only the remaining collectors. The standalone package still captures runtime errors only. A mixed runtime-error/console source regression test verifies routing and prevents duplicate collector installation.

After generalization: 110 focused tests passed, the separate-bundle browser checks passed again, and review found no material regressions. Lint/formatting pass with the existing expired-comment warning; full typecheck still reports only the unrelated missing generated schema files.

## Shared source factory for Logs

User requested using the early-error source in Logs to simplify the core integration. Logs now creates an independent source through createDataBuffer; RUM still adopts its own global early buffer. startBufferingData requires a source and no longer imports or installs trackRuntimeError. The independence regression checks that Logs cannot consume or stop RUM's early/live history.

Shared-factory verification: 136 focused tests passed; core, source, Logs, and RUM bundles built; Chrome verified independent Logs/RUM behavior with real errors and diagnostic forwarding. The standalone artifact remains 11,471 bytes minified / 4,680 bytes gzip. Typecheck remains blocked only by the unrelated generated schema files.

## Single data buffer

User approved removing the second buffer. BufferedDataSource exposes its BufferedObservable directly; startBufferingData reuses it and attaches remaining collectors. There is no forwarding subscription, top-level source.unbuffer, or release at SDK evaluation. Existing startRum/startLogs unbuffer calls release the unified history at initialization. Regression coverage asserts buffer identity and history retention across adoption, and stops drop telemetry after teardown.

Single-buffer verification: 138 focused tests passed. Built-bundle Chrome checks confirmed the same source retains history after SDK evaluation until initialization, plus independent Logs/RUM behavior and diagnostic forwarding. Final bundle: 11,642 bytes minified / 4,737 bytes gzip. Lint/formatting and builds pass. Standard typecheck reports only the pre-existing missing generated schema imports. Review found no ordering/lifecycle regression; discovery now rejects sources lacking required runtime-error capture.

## Collector subscription ownership

User requested moving subscribe into rumBuffer. The source now owns deduplication, collector subscription and cleanup, including its initial runtime-error collector. Core startBufferingData only connects diagnostics and passes SDK-only collector factories into source.subscribe, then returns the same source. A regression covers deduplication and stopping additional collectors; foreign-handle discovery checks the new subscribe method.

Subscription-ownership verification: 139 focused tests passed, core/source/Logs/RUM builds passed, and review found no material regressions. Typecheck reports only the pre-existing missing generated schema imports. The standalone source map still excludes network/console collectors and transport.

## Remove runtime compatibility checks

At the user's request, removed isRumBuffer, protocolVersion metadata, and fallback behavior for incompatible handles. The typed global now directly reuses an existing source or creates one if absent. Removed obsolete rejection tests and retained existing-handle reuse coverage.
