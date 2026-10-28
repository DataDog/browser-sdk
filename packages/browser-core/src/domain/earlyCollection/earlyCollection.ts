import type { ClocksState, RelativeTime } from '@datadog/js-core/time'
import { globalObject } from '@datadog/js-core/util'
import type { Profiler } from '@datadog/js-core/util'

/**
 * Name of the `window` global published by the early collection package: a
 * standalone snippet (see `packages/browser-early-collection`) evaluated as the
 * first script of the page, which collects uncaught errors and starts the JS
 * Self-Profiling API Profiler before the SDK bundle is evaluated. The SDK
 * checks for it at bundle evaluation (see `startBufferingData`) and takes it
 * over at init.
 */
export const EARLY_COLLECTION_GLOBAL_NAME = '_DD_EARLY_COLLECTION'

/** Contract versions the SDK knows how to adopt. */
const SUPPORTED_CONTRACT_VERSION = 1

/**
 * Entry types of the early collection buffer. Values are part of the handoff
 * contract: keep them in sync with the early collection package.
 */
export const enum EarlyCollectionEntryType {
  /** Raw data of an uncaught error or unhandled rejection (usually an Error). */
  RUNTIME_ERROR = 0,
}

/**
 * The `window` global published by the early collection package (contract v1).
 *
 * The SDK interprets the raw entries, so a shape drift between an old pasted
 * snippet and a future SDK cannot corrupt events: the contract reduces to the
 * entry-type enum, timestamp semantics and `stop()` idempotence.
 */
export interface EarlyCollectionGlobal {
  /** Contract version. The SDK ignores the global when it does not recognize it. */
  readonly version: number
  /** Clocks captured when the early collection started. */
  readonly startClocks: ClocksState
  /** Raw entries buffered between HTML parse and the SDK init, capped by the snippet. */
  readonly buffer: Array<[EarlyCollectionEntryType, RelativeTime, unknown]>
  /** Profiler instance started by the snippet, when the JS Self-Profiling API is available. */
  readonly profiler: Profiler | undefined
  /** Seals the collection. Idempotent; the listeners stay installed but inert. */
  readonly stop: () => void
}

interface EarlyCollectionGlobalOwner {
  [EARLY_COLLECTION_GLOBAL_NAME]?: unknown
}

/**
 * Reads the early collection global, without claiming it.
 *
 * Returns `undefined` when the early collection package did not run, or when
 * its contract version or shape is not recognized: in that case the SDK must
 * behave exactly as if the package was not there (clean degradation is the
 * main contract win of the raw-entry design).
 */
export function readEarlyCollection(): EarlyCollectionGlobal | undefined {
  const rawGlobal = (globalObject as EarlyCollectionGlobalOwner)[EARLY_COLLECTION_GLOBAL_NAME]
  if (typeof rawGlobal !== 'object' || rawGlobal === null) {
    return undefined
  }
  const candidate = rawGlobal as Partial<EarlyCollectionGlobal>
  if (
    candidate.version !== SUPPORTED_CONTRACT_VERSION ||
    !Array.isArray(candidate.buffer) ||
    typeof candidate.stop !== 'function'
  ) {
    return undefined
  }
  return rawGlobal as EarlyCollectionGlobal
}
