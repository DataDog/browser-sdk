import type { Duration, RelativeTime, TimeoutId } from '@datadog/browser-core'
import { addEventListener, Observable, setTimeout, clearTimeout, monitor, includes } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import { isAllowedRequestUrl } from '../domain/resource/resourceUtils'

type RumPerformanceObserverConstructor = new (callback: PerformanceObserverCallback) => RumPerformanceObserver

export interface BrowserWindow extends Window {
  PerformanceObserver: RumPerformanceObserverConstructor
  performance: Performance & { interactionCount?: number }
}

export interface RumPerformanceObserver extends PerformanceObserver {
  observe(options?: PerformanceObserverInit & { durationThreshold: number }): void
}

// We want to use a real enum (i.e. not a const enum) here, to be able to check whether an arbitrary
// string is an expected performance entry
// eslint-disable-next-line no-restricted-syntax
export enum RumPerformanceEntryType {
  EVENT = 'event',
  FIRST_INPUT = 'first-input',
  LARGEST_CONTENTFUL_PAINT = 'largest-contentful-paint',
  LAYOUT_SHIFT = 'layout-shift',
  LONG_TASK = 'longtask',
  NAVIGATION = 'navigation',
  PAINT = 'paint',
  RESOURCE = 'resource',
}

export interface RumPerformanceLongTaskTiming {
  name: string
  entryType: RumPerformanceEntryType.LONG_TASK
  startTime: RelativeTime
  duration: Duration
  toJSON(): Omit<PerformanceEntry, 'toJSON'>
}

export interface RumPerformanceResourceTiming {
  entryType: RumPerformanceEntryType.RESOURCE
  initiatorType: string
  responseStatus?: number
  name: string
  startTime: RelativeTime
  duration: Duration
  fetchStart: RelativeTime
  domainLookupStart: RelativeTime
  domainLookupEnd: RelativeTime
  connectStart: RelativeTime
  secureConnectionStart: RelativeTime
  connectEnd: RelativeTime
  requestStart: RelativeTime
  responseStart: RelativeTime
  responseEnd: RelativeTime
  redirectStart: RelativeTime
  redirectEnd: RelativeTime
  decodedBodySize: number
  encodedBodySize: number
  transferSize: number
  renderBlockingStatus?: string
  traceId?: string
  toJSON(): Omit<PerformanceEntry, 'toJSON'>
}

export interface RumPerformancePaintTiming {
  entryType: RumPerformanceEntryType.PAINT
  name: 'first-paint' | 'first-contentful-paint'
  startTime: RelativeTime
}

export interface RumPerformanceNavigationTiming {
  entryType: RumPerformanceEntryType.NAVIGATION
  domComplete: RelativeTime
  domContentLoadedEventEnd: RelativeTime
  domInteractive: RelativeTime
  loadEventEnd: RelativeTime
  responseStart: RelativeTime
}

export interface RumLargestContentfulPaintTiming {
  entryType: RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT
  startTime: RelativeTime
  size: number
  element?: Element
  toJSON(): Omit<RumLargestContentfulPaintTiming, 'toJSON'>
}

export interface RumFirstInputTiming {
  entryType: RumPerformanceEntryType.FIRST_INPUT
  startTime: RelativeTime
  processingStart: RelativeTime
  processingEnd: RelativeTime
  duration: Duration
  target?: Node
  interactionId?: number
  name: string
}

export interface RumPerformanceEventTiming {
  entryType: RumPerformanceEntryType.EVENT
  startTime: RelativeTime
  processingStart: RelativeTime
  processingEnd: RelativeTime
  duration: Duration
  interactionId?: number
  target?: Node
  name: string
}

export interface RumLayoutShiftTiming {
  entryType: RumPerformanceEntryType.LAYOUT_SHIFT
  startTime: RelativeTime
  value: number
  hadRecentInput: boolean
  sources?: Array<{
    node?: Node
  }>
}

export type RumPerformanceEntry =
  | RumPerformanceResourceTiming
  | RumPerformanceLongTaskTiming
  | RumPerformancePaintTiming
  | RumPerformanceNavigationTiming
  | RumLargestContentfulPaintTiming
  | RumFirstInputTiming
  | RumPerformanceEventTiming
  | RumLayoutShiftTiming

export type EntryTypeToReturnType = {
  [RumPerformanceEntryType.EVENT]: RumPerformanceEventTiming
  [RumPerformanceEntryType.FIRST_INPUT]: RumFirstInputTiming
  [RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT]: RumLargestContentfulPaintTiming
  [RumPerformanceEntryType.LAYOUT_SHIFT]: RumLayoutShiftTiming
  [RumPerformanceEntryType.PAINT]: RumPerformancePaintTiming
  [RumPerformanceEntryType.LONG_TASK]: RumPerformanceLongTaskTiming
  [RumPerformanceEntryType.NAVIGATION]: RumPerformanceNavigationTiming
  [RumPerformanceEntryType.RESOURCE]: RumPerformanceResourceTiming
}

export function createPerformanceObservable<T extends RumPerformanceEntryType>(
  configuration: RumConfiguration,
  options: { type: T; buffered?: boolean; durationThreshold?: number }
) {
  return new Observable<Array<EntryTypeToReturnType[T]>>((observable) => {
    if (!window.PerformanceObserver) {
      return
    }

    const handlePerformanceEntries = (entries: PerformanceEntryList) => {
      const rumPerformanceEntries = filterRumPerformanceEntries(
        configuration,
        entries as Array<EntryTypeToReturnType[T]>
      )
      if (rumPerformanceEntries.length > 0) {
        observable.notify(rumPerformanceEntries)
      }
    }

    let timeoutId: TimeoutId | undefined
    let isObserverInitializing = true
    const observer = new PerformanceObserver(
      monitor((entries) => {
        // In Safari the performance observer callback is synchronous.
        // Because the buffered performance entry list can be quite large we delay the computation to prevent the SDK from blocking the main thread on init
        if (isObserverInitializing) {
          timeoutId = setTimeout(() => handlePerformanceEntries(entries.getEntries()))
        } else {
          handlePerformanceEntries(entries.getEntries())
        }
      })
    )
    try {
      observer.observe(options)
    } catch {
      // Some old browser versions (<= chrome 74 ) don't support the PerformanceObserver type and buffered options
      // In these cases, fallback to getEntriesByType and PerformanceObserver with entryTypes
      // TODO: remove this fallback in the next major version
      const fallbackSupportedEntryTypes = [
        RumPerformanceEntryType.RESOURCE,
        RumPerformanceEntryType.NAVIGATION,
        RumPerformanceEntryType.LONG_TASK,
        RumPerformanceEntryType.PAINT,
      ]
      if (includes(fallbackSupportedEntryTypes, options.type)) {
        if (options.buffered) {
          timeoutId = setTimeout(() => handlePerformanceEntries(performance.getEntriesByType(options.type)))
        }
        try {
          observer.observe({ entryTypes: [options.type] })
        } catch {
          // Old versions of Safari are throwing "entryTypes contained only unsupported types"
          // errors when observing only unsupported entry types.
          //
          // We could use `supportPerformanceTimingEvent` to make sure we don't invoke
          // `observer.observe` with an unsupported entry type, but Safari 11 and 12 don't support
          // `Performance.supportedEntryTypes`, so doing so would lose support for these versions
          // even if they do support the entry type.
          return
        }
      }
    }
    isObserverInitializing = false

    manageResourceTimingBufferFull(configuration)

    return () => {
      observer.disconnect()
      clearTimeout(timeoutId)
    }
  })
}

let resourceTimingBufferFullListener: { stop: () => void }
function manageResourceTimingBufferFull(configuration: RumConfiguration) {
  if (!resourceTimingBufferFullListener && supportPerformanceObject() && 'addEventListener' in performance) {
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1559377
    resourceTimingBufferFullListener = addEventListener(configuration, performance, 'resourcetimingbufferfull', () => {
      performance.clearResourceTimings()
    })
  }
  return () => {
    resourceTimingBufferFullListener?.stop()
  }
}

function supportPerformanceObject() {
  return window.performance !== undefined && 'getEntries' in performance
}

export function supportPerformanceTimingEvent(entryType: RumPerformanceEntryType) {
  return (
    window.PerformanceObserver &&
    PerformanceObserver.supportedEntryTypes !== undefined &&
    PerformanceObserver.supportedEntryTypes.includes(entryType)
  )
}

function filterRumPerformanceEntries<T extends RumPerformanceEntryType>(
  configuration: RumConfiguration,
  entries: Array<EntryTypeToReturnType[T]>
) {
  return entries.filter((entry) => !isForbiddenResource(configuration, entry))
}

function isForbiddenResource(configuration: RumConfiguration, entry: RumPerformanceEntry) {
  return entry.entryType === RumPerformanceEntryType.RESOURCE && !isAllowedRequestUrl(configuration, entry.name)
}
