/**
 * @datadog/core-next
 *
 * Environment-agnostic pipeline infrastructure for the Datadog SDK v8.
 * Zero domain knowledge — provides typed pub/sub with enricher chains.
 *
 * ## Enricher API
 * - {@link Enricher} — Interface for a named data transformer.
 * - {@link enricher} — Factory function to create type-safe enrichers with dependency inference.
 * - {@link chain} — Composes enrichers into a reusable processing function.
 * - {@link topologicalSort} — Sorts enrichers by their dependency graph.
 * - {@link OutputOf} — Extracts the output type from an enricher.
 * - {@link MaybePromise} — Utility type for sync-or-async values.
 *
 * ## Pipeline API
 * - {@link Pipeline} — Typed pub/sub event bus with enricher support.
 * - {@link Subscription} — Handle to unsubscribe from a pipeline event.
 */

export type { Enricher } from './domain/enricher'
export { enricher } from './domain/enricher'

export { Pipeline } from './domain/pipeline'
export type { Subscription } from './domain/pipeline'

export type { Duration, ServerDuration, TimeStamp, RelativeTime, ClocksState } from './domain/time'
export {
  ONE_SECOND,
  ONE_MINUTE,
  ONE_HOUR,
  ONE_DAY,
  ONE_YEAR,
  elapsed,
  addDuration,
  toServerDuration,
  looksLikeRelativeTime,
} from './domain/time'

export type { Csp, StackFrame, StackTrace } from './domain/error'
export { ErrorSource, ErrorHandling } from './domain/error'

export type { Transport } from './domain/transport/transport'
export type { BatchOptions } from './domain/transport/batch'
export { Batch } from './domain/transport/batch'

export { EventEmitter, throttle } from './utils'

export type { InitConfiguration, Configuration, ConfigExtension } from './domain/configuration/configuration'
export { buildConfiguration } from './domain/configuration/configuration'
