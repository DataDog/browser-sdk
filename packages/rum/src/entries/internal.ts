/**
 * Entry point consumed by the Datadog Web app to mutualize some types, constant and logic for
 * tests.
 *
 * WARNING: this module is not intended for public usages, and won't follow semver for breaking
 * changes.
 */
import type { BrowserProfiling as RefBrowserProfiling } from 'rum-events-format/profiling'

export type { TimeStamp } from '@datadog/browser-core'
export {
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_CLASS_PREFIX,
  NodePrivacyLevel,
} from '@datadog/browser-rum-core'

export * from 'rum-events-format/session-replay-browser'
export type * from 'rum-events-format/profiling'
export type BrowserProfiling = RefBrowserProfiling.BrowserProfiling
export type BrowserProfileEvent = RefBrowserProfiling.BrowserProfileEvent
export type ProfileCommonProperties = RefBrowserProfiling.ProfileCommonProperties
export type BrowserProfilerTrace = RefBrowserProfiling.BrowserProfilerTrace
export type ProfilerFrame = RefBrowserProfiling.ProfilerFrame
export type ProfilerStack = RefBrowserProfiling.ProfilerStack
export type ProfilerSample = RefBrowserProfiling.ProfilerSample
export type ClocksState = RefBrowserProfiling.ClocksState
export type RumProfilerLongTaskEntry = RefBrowserProfiling.RumProfilerLongTaskEntry
export type RumProfilerVitalEntry = RefBrowserProfiling.RumProfilerVitalEntry
export type RumProfilerActionEntry = RefBrowserProfiling.RumProfilerActionEntry
export type RumViewEntry = RefBrowserProfiling.RumViewEntry

export { takeFullSnapshot, takeNodeSnapshot, serializeNode as serializeNodeWithId } from '../domain/record'
