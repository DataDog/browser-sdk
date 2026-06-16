/**
 * Sub-entry for use inside a Dedicated Worker.
 *
 * Import this from your worker script:
 *   import { attachProfiler } from '@datadog/browser-rum/worker'
 *
 * This entry has zero dependencies on browser-core, browser-rum-core, or DOM APIs.
 */
export { attachProfiler } from '../domain/profiling/workerProfilingAgent'
export type { WorkerScopeForProfiling } from '../domain/profiling/workerProfilingAgent'
