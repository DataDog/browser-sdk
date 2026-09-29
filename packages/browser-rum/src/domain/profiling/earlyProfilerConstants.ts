/**
 * Name of the `window` global set by the early profiler snippet. The snippet is
 * a small inline `<script>` customers add to their HTML `<head>`, so collection
 * starts before the SDK bundle is loaded:
 *
 * ```html
 * <script>
 *   window._DD_RUM_EARLY_PROFILER = function (w) {
 *     try {
 *       return {
 *         profiler: new w.Profiler({ sampleInterval: 10, maxBufferSize: 9000 }),
 *         startClocks: { relative: w.performance.now(), timeStamp: Date.now() },
 *       }
 *     } catch (e) {}
 *   }(window)
 * </script>
 * ```
 *
 * The Profiler instance and its start time are stored so the SDK can adopt them
 * when it loads, and keep the samples collected before that.
 *
 * The snippet fails silently (leaves the global `undefined`) when the browser
 * does not support the Profiler API or the page is missing the
 * `Document-Policy: js-profiling` response header.
 *
 * `sampleInterval: 10` and `maxBufferSize: 9000` must match
 * `DEFAULT_RUM_PROFILER_CONFIGURATION` (10 ms sample interval, 1.5 × 60 s of
 * samples). A mismatch is not fatal (the trace carries the actual
 * `sampleInterval`), but the buffer window would differ from the regular run.
 */
export const EARLY_PROFILER_GLOBAL_NAME = '_DD_RUM_EARLY_PROFILER'
