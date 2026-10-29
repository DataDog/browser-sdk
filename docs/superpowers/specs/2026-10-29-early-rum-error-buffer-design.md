# Early RUM error buffering

## Intent and agreed scope

Offer a small synchronous script that captures errors before an asynchronously loaded or npm-bundled RUM SDK evaluates. Use the same error capture implementation when the SDK evaluates without that script. The initial version supports RUM only and captures uncaught exceptions and unhandled promise rejections, not console.error.

Keep stack parsing, sanitization, trackRuntimeError, and computeRawError in browser-core. Produce the existing RawError at capture time and feed the existing errorCollection and assembly pipeline without introducing another error construction stage. Logs uses the same source factory through the new package, with an independent buffer starting at Logs evaluation. Logs does not consume the early RUM history.

The size spike, using the existing collector and a 500-entry BufferedObservable, measured 10,740 bytes minified and 4,412 bytes gzip with production Webpack settings. This is an accepted baseline, not a hard budget or a guarantee for the finished package.

## Dependency direction

browser-rum-core and browser-logs depend on the new package; the new package depends on browser-core and js-core. browser-core never imports the new package. SDK-specific callbacks can be passed as function parameters where necessary. Existing utility files remain in place.

The standalone entry imports only the error capture path. Keep fetch, XHR, and console setup out of that entry's reachable runtime dependencies. Verify this with the built bundle rather than assuming package boundaries ensure small output.

## Proposed implementation choices

These are assistant recommendations for approval, not additional requirements supplied by the user.

- Package name: @datadog/browser-rum-buffer, with a synchronous CDN bundle and a module entry for browser-rum-core. Follow existing workspace package and build conventions.
- The package owns a small wrapper around browser-core's existing trackRuntimeError and a BufferedObservable<BufferedData>, plus early-script discovery and adoption. It does not copy the error collector implementation.
- The CDN entry immediately starts this wrapper and stores its handle in a dedicated internal global. No customer init call, token, or configuration is needed for buffering. It neither sends events nor initializes RUM.
- The module entry reuses an existing early handle if present; otherwise it starts the same wrapper during makeRumPublicApi, at the existing startBufferingData call site.
- Give browser-core's startBufferingData a required injected BufferedDataSource. The source declares its collected BufferedDataType values and emits the existing BufferedData union; start SDK collectors only for types not supplied by the source. V1 declares only RUNTIME_ERROR. RUM adopts or creates its source; Logs and other callers explicitly create independent sources. Core no longer installs a runtime-error fallback. Keep the optional dependency structural/type-only so core never imports the new package.
- Use the source's BufferedObservable directly as the SDK buffer; attach the remaining collectors to it. The source wraps runtime errors with the existing RUNTIME_ERROR discriminator. This is event routing, not another RawError construction stage. Fetch, XHR, and console continue to start at RUM SDK evaluation time as today.

## Buffer and lifecycle

Use the existing 500-entry bound and drop-oldest policy. The standalone script buffers until RUM evaluates, even if RUM never initializes. If RUM never arrives, retain at most 500 errors for the page lifetime.

At SDK evaluation, adopt the source's existing BufferedObservable and attach the remaining collectors directly. Do not create another data buffer, forward between data buffers, or unbuffer during adoption. Retain the unified, bounded 500-entry history until startRum or startLogs subscribes its consumers and calls observable.unbuffer() at initialization.

Continue using the adopted live collector after replay; do not install a second RUM runtime-error collector or stop/reinstall handlers during adoption. Cleanup must unsubscribe the bridge and stop its owned collector when the buffering lifecycle is stopped. Do not emit an error twice or lose events between replay and live delivery. Retain the original capture clocks, stack, causes, and RawError fields.

Repeated early-script evaluation must reuse the existing handle. An early script evaluated after RUM has adopted the handle must not restart buffering or instrumentation. Retain a lightweight global handle/state marker to make this idempotent.

Only the ordinary single-RUM-instance setup is supported in v1. A separate Logs SDK may coexist and continues its existing independent collector; it does not receive this early RUM history. Do not add dual-consumer queues or customer SDK-selection options.

## Compatibility and integration

Directly reuse the typed internal global handle when present, without runtime shape or protocol checks. Create a buffer when absent. Use matching buffer and SDK releases; no instanceof checks or shared module identity are required.

Preserve current consent, sampling, and initialization behavior: this is the same in-memory pre-init capture started earlier, and emission remains controlled by the existing RUM pipeline. It does not capture events that happened before the synchronous script executed.

RawError processing must remain on the existing implementation, including debug-ID lookup. Review any module-local telemetry/monitor state pulled into the separate bundle: explicitly pass needed SDK callbacks during adoption if required, without making core depend on the package. Do not pull in transport or full SDK initialization just to forward diagnostic callbacks.

## Verification and delivery

- Build and inspect the standalone minified and gzip sizes, including the final global/adoption code. Report the difference from the spike and check that fetch, XHR, console capture and transport are absent.
- Test uncaught exceptions and rejected promises before SDK evaluation, between evaluation and init, and after init. Each must reach the RUM error pipeline exactly once with its original timestamp and existing RawError processing.
- Test SDK-only operation, delayed/no init, buffer overflow, replay/live ordering, stop, repeated script evaluation, script-after-SDK, and absent/existing handles.
- Verify console.error is not captured by the standalone entry; existing SDK console behavior and Logs buffering remain unchanged.
- Test the built script plus built RUM SDK in a browser with an actual exception/rejection during the loading gap, and check that initial HTML parsing can resume without loading the full SDK synchronously.
- Add the package to the repository's relevant build, release/CDN artifact, size tracking, and dependency configuration. Validate registration; do not publish or deploy as part of implementation.
- Document synchronous placement before application scripts and normal RUM loading afterward, including supported versions. No public CDN URL is claimed to exist until release.

## Left to the builder

Choose the internal global name, exported helper names and structural interfaces, precise file layout, and callback signatures. Reuse existing test/build/release conventions and keep the dependency direction above. Do not add new public RUM configuration or move utility modules as an incidental cleanup.
