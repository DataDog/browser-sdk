import type { Duration, RelativeTime, TimeoutId } from '@datadog/browser-core'
import { addEventListener, Observable, setTimeout, clearTimeout, monitor } from '@datadog/browser-core'
import type { RumConfiguration } from '../domain/configuration'
import { hasValidResourceEntryDuration, isAllowedRequestUrl } from '../domain/resource/resourceUtils'
import { retrieveFirstInputTiming } from './firstInputPolyfill'

type RumPerformanceObserverConstructor = new (callback: PerformanceObserverCallback) => RumPerformanceObserver

export interface BrowserWindow extends Window {
  PerformanceObserver: RumPerformanceObserverConstructor
  performance: Performance & { interactionCount?: number }
}

export interface RumPerformanceObserver extends PerformanceObserver {
  observe(options?: PerformanceObserverInit & { durationThreshold?: number }): void
}

export const RumPerformanceEntryType = {
  EVENT: 'event',
  FIRST_INPUT: 'first-input',
  LARGEST_CONTENTFUL_PAINT: 'largest-contentful-paint',
  LAYOUT_SHIFT: 'layout-shift',
  LONG_TASK: 'longtask',
  LONG_ANIMATION_FRAME: 'long-animation-frame',
  NAVIGATION: 'navigation',
  PAINT: 'paint',
  RESOURCE: 'resource',
  VISIBILITY_STATE: 'visibility-state',
} as const
export type RumPerformanceEntryTypeEnum = (typeof RumPerformanceEntryType)[keyof typeof RumPerformanceEntryType]

export interface RumPerformanceLongTaskTiming {
  name: string
  entryType: typeof RumPerformanceEntryType.LONG_TASK
  startTime: RelativeTime
  duration: Duration
  toJSON(): Omit<PerformanceEntry, 'toJSON'>
}

export interface RumPerformanceResourceTiming {
  entryType: typeof RumPerformanceEntryType.RESOURCE
  initiatorType: string
  responseStatus?: number
  name: string
  startTime: RelativeTime
  duration: Duration
  fetchStart: RelativeTime
  workerStart: RelativeTime
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
  nextHopProtocol?: string
  renderBlockingStatus?: string
  traceId?: string
  deliveryType?: string
  toJSON(): Omit<PerformanceEntry, 'toJSON'>
}

export interface RumPerformancePaintTiming {
  entryType: typeof RumPerformanceEntryType.PAINT
  name: 'first-paint' | 'first-contentful-paint'
  startTime: RelativeTime
  toJSON(): Omit<RumPerformancePaintTiming, 'toJSON'>
}

export interface RumPerformanceNavigationTiming extends Omit<RumPerformanceResourceTiming, 'entryType'> {
  entryType: typeof RumPerformanceEntryType.NAVIGATION
  initiatorType: 'navigation'
  name: string

  domComplete: RelativeTime
  domContentLoadedEventEnd: RelativeTime
  domInteractive: RelativeTime
  loadEventEnd: RelativeTime

  toJSON(): Omit<RumPerformanceNavigationTiming, 'toJSON'>
}

export interface RumLargestContentfulPaintTiming {
  entryType: typeof RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT
  startTime: RelativeTime
  size: number
  element?: Element
  url?: string
  toJSON(): Omit<RumLargestContentfulPaintTiming, 'toJSON'>
}

export interface RumFirstInputTiming {
  entryType: typeof RumPerformanceEntryType.FIRST_INPUT
  startTime: RelativeTime
  processingStart: RelativeTime
  processingEnd: RelativeTime
  duration: Duration
  target?: Node
  interactionId?: number
  toJSON(): Omit<RumFirstInputTiming, 'toJSON'>
}

export interface RumPerformanceEventTiming {
  entryType: typeof RumPerformanceEntryType.EVENT
  startTime: RelativeTime
  processingStart: RelativeTime
  processingEnd: RelativeTime
  duration: Duration
  interactionId?: number
  target?: Node
  name: string
  toJSON(): Omit<RumPerformanceEventTiming, 'toJSON'>
}

export interface RumLayoutShiftAttribution {
  node: Node | null
  previousRect: DOMRectReadOnly
  currentRect: DOMRectReadOnly
}

export interface RumLayoutShiftTiming {
  entryType: typeof RumPerformanceEntryType.LAYOUT_SHIFT
  startTime: RelativeTime
  value: number
  hadRecentInput: boolean
  sources: RumLayoutShiftAttribution[]
  toJSON(): Omit<RumLayoutShiftTiming, 'toJSON'>
}

// Documentation https://developer.chrome.com/docs/web-platform/long-animation-frames#better-attribution
export type RumPerformanceScriptTiming = {
  duration: Duration
  entryType: 'script'
  executionStart: RelativeTime
  forcedStyleAndLayoutDuration: Duration
  invoker: string // e.g. "https://static.datadoghq.com/static/c/93085/chunk-bc4db53278fd4c77a637.min.js"
  invokerType:
    | 'user-callback'
    | 'event-listener'
    | 'resolve-promise'
    | 'reject-promise'
    | 'classic-script'
    | 'module-script'
  name: 'script'
  pauseDuration: Duration
  sourceCharPosition: number
  sourceFunctionName: string
  sourceURL: string
  startTime: RelativeTime
  window: Window
  windowAttribution: string
}

export interface RumPerformanceLongAnimationFrameTiming {
  blockingDuration: Duration
  duration: Duration
  entryType: typeof RumPerformanceEntryType.LONG_ANIMATION_FRAME
  firstUIEventTimestamp: RelativeTime
  name: 'long-animation-frame'
  renderStart: RelativeTime
  scripts: RumPerformanceScriptTiming[]
  startTime: RelativeTime
  styleAndLayoutStart: RelativeTime
  toJSON(): Omit<RumPerformanceLongAnimationFrameTiming, 'toJSON'>
}

export interface RumFirstHiddenTiming {
  entryType: typeof RumPerformanceEntryType.VISIBILITY_STATE
  name: 'hidden' | 'visible'
  startTime: RelativeTime
  toJSON(): Omit<RumFirstHiddenTiming, 'toJSON'>
}

export type RumPerformanceEntry =
  | RumPerformanceResourceTiming
  | RumPerformanceLongTaskTiming
  | RumPerformanceLongAnimationFrameTiming
  | RumPerformancePaintTiming
  | RumPerformanceNavigationTiming
  | RumLargestContentfulPaintTiming
  | RumFirstInputTiming
  | RumPerformanceEventTiming
  | RumLayoutShiftTiming
  | RumFirstHiddenTiming

export type EntryTypeToReturnType = {
  [K in RumPerformanceEntryTypeEnum]:
    K extends typeof RumPerformanceEntryType.EVENT ? RumPerformanceEventTiming :
    K extends typeof RumPerformanceEntryType.FIRST_INPUT ? RumFirstInputTiming :
    K extends typeof RumPerformanceEntryType.LARGEST_CONTENTFUL_PAINT ? RumLargestContentfulPaintTiming :
    K extends typeof RumPerformanceEntryType.LAYOUT_SHIFT ? RumLayoutShiftTiming :
    K extends typeof RumPerformanceEntryType.PAINT ? RumPerformancePaintTiming :
    K extends typeof RumPerformanceEntryType.LONG_TASK ? RumPerformanceLongTaskTiming :
    K extends typeof RumPerformanceEntryType.LONG_ANIMATION_FRAME ? RumPerformanceLongAnimationFrameTiming :
    K extends typeof RumPerformanceEntryType.NAVIGATION ? RumPerformanceNavigationTiming :
    K extends typeof RumPerformanceEntryType.RESOURCE ? RumPerformanceResourceTiming :
    K extends typeof RumPerformanceEntryType.VISIBILITY_STATE ? RumFirstHiddenTiming :
    never
}

export function createPerformanceObservable<T extends RumPerformanceEntryTypeEnum>(
  configuration: RumConfiguration,
  options: { type: T; buffered?: boolean; durationThreshold?: number }
) {
  return new Observable<Array<EntryTypeToReturnType[T]>>((observable) => {
    if (!window.PerformanceObserver) {
      return
    }

    const handlePerformanceEntries = (entries: PerformanceEntryList) => {
      const rumPerformanceEntries = filterRumPerformanceEntries(entries as Array<EntryTypeToReturnType[T]>)
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
      const fallbackSupportedEntryTypes: string[] = [
        RumPerformanceEntryType.RESOURCE,
        RumPerformanceEntryType.NAVIGATION,
        RumPerformanceEntryType.LONG_TASK,
        RumPerformanceEntryType.PAINT,
      ]
      if (fallbackSupportedEntryTypes.includes(options.type)) {
        if (options.buffered) {
          timeoutId = setTimeout(() => handlePerformanceEntries(performance.getEntriesByType(options.type as string)))
        }
        try {
          observer.observe({ entryTypes: [options.type as string] })
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

    let stopFirstInputTiming: (() => void) | undefined
    if (
      !supportPerformanceTimingEvent(RumPerformanceEntryType.FIRST_INPUT) &&
      options.type === RumPerformanceEntryType.FIRST_INPUT
    ) {
      ;({ stop: stopFirstInputTiming } = retrieveFirstInputTiming(configuration, (timing) => {
        handlePerformanceEntries([timing])
      }))
    }

    return () => {
      observer.disconnect()
      if (stopFirstInputTiming) {
        stopFirstInputTiming()
      }
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

export function supportPerformanceTimingEvent(entryType: RumPerformanceEntryTypeEnum) {
  return (
    window.PerformanceObserver &&
    PerformanceObserver.supportedEntryTypes !== undefined &&
    PerformanceObserver.supportedEntryTypes.includes(entryType)
  )
}

function filterRumPerformanceEntries<T extends RumPerformanceEntryTypeEnum>(entries: Array<EntryTypeToReturnType[T]>) {
  return entries.filter((entry) => !isForbiddenResource(entry))
}

function isForbiddenResource(entry: RumPerformanceEntry) {
  return (
    entry.entryType === RumPerformanceEntryType.RESOURCE &&
    (!isAllowedRequestUrl(entry.name) || !hasValidResourceEntryDuration(entry))
  )
}
