import type {
  RumInitConfiguration,
  RumPlugin,
  OnRumStartOptions,
  AllowedRawRumEvent,
} from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import type { RelativeTime, TimeStamp, Duration, Subscription } from '@datadog/browser-core'
import {
  addEventListener,
  buildUrl,
  DOM_EVENT,
  generateUUID,
  getTimeStamp,
  isIntakeUrl,
  ResourceType,
  toServerDuration,
} from '@datadog/browser-core'
import { subscribeToSalesforceResourcePoll } from './resourcePollChannel'
import type { SalesforceResourcePoll, SalesforceResourcePollView } from './resourcePollChannel'

const MAX_SEEN_RESOURCE_KEYS = 1000
const INITIAL_DOCUMENT_INITIATOR_TYPE = 'initial_document'
const NOOP_STOP_CALLBACK = () => undefined

type AddEvent = NonNullable<OnRumStartOptions['addEvent']>

interface SalesforceResourceTrackingOptions {
  addEvent: AddEvent
  configuration: Pick<RumInitConfiguration, 'allowUntrustedEvents'>
  getNavigationEntry?: () => RumPerformanceNavigationTimingLike | undefined
  subscribeToResourcePolls?: (callback: (poll: SalesforceResourcePoll) => void) => Subscription
}

interface RumPerformanceNavigationTimingLike {
  name: string
  startTime: RelativeTime
  responseEnd: RelativeTime
  fetchStart: RelativeTime
  workerStart: RelativeTime
  domainLookupStart: RelativeTime
  domainLookupEnd: RelativeTime
  connectStart: RelativeTime
  secureConnectionStart: RelativeTime
  connectEnd: RelativeTime
  requestStart: RelativeTime
  responseStart: RelativeTime
  redirectStart: RelativeTime
  redirectEnd: RelativeTime
  decodedBodySize?: number
  encodedBodySize?: number
  transferSize?: number
  nextHopProtocol?: string
  renderBlockingStatus?: string
  responseStatus?: number
}

interface RumPerformanceResourceTiming {
  entryType: 'resource'
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
  decodedBodySize?: number
  encodedBodySize?: number
  transferSize?: number
  nextHopProtocol?: string
  renderBlockingStatus?: string
  deliveryType?: 'cache' | 'navigational-prefetch' | ''
  contentType?: string
  traceId?: string
  toJSON(): Omit<PerformanceEntry, 'toJSON'>
}

export function createSalesforceResourcePlugin(
  initConfiguration: Pick<RumInitConfiguration, 'allowUntrustedEvents'>,
  deps?: Omit<SalesforceResourceTrackingOptions, 'addEvent' | 'configuration'>
): RumPlugin {
  return {
    name: 'salesforce-resource-polling',
    onRumStart({ addEvent }) {
      if (!addEvent) {
        return
      }

      startSalesforceResourceTracking({
        addEvent,
        configuration: initConfiguration,
        ...deps,
      })
    },
  }
}

export function startSalesforceResourceTracking(options: SalesforceResourceTrackingOptions) {
  const getNavigationEntry = options.getNavigationEntry ?? getNavigationResourceEntry
  const subscribeToResourcePolls = options.subscribeToResourcePolls ?? subscribeToSalesforceResourcePoll
  const seenResourceEntryKeys = createBoundedKeyStore()
  let currentView: SalesforceResourcePollView | undefined

  const readyStateSubscription = runOnInteractiveReadyState(options.configuration, () => {
    if (!currentView) {
      return
    }

    const initialDocumentEntry = getInitialDocumentResourceTiming(getNavigationEntry())
    if (initialDocumentEntry && initialDocumentEntry.responseEnd >= currentView.startRelativeTime) {
      emitResourceEntry(initialDocumentEntry)
    }
  })

  const resourcePollSubscription = subscribeToResourcePolls(({ currentView: trackedView, resourceEntries }) => {
    currentView = trackedView

    if (!currentView) {
      return
    }

    for (const entry of resourceEntries || []) {
      if (hasResponseEndedAfterViewStart(entry, currentView.startRelativeTime)) {
        emitResourceEntry(entry as RumPerformanceResourceTiming)
      }
    }
  })

  const resourceTimingBufferFullSubscription = addResourceTimingBufferFullListener(options.configuration, () => {
    if (currentView) {
      for (const entry of getPerformanceResourceEntries() || []) {
        if (hasResponseEndedAfterViewStart(entry, currentView.startRelativeTime)) {
          emitResourceEntry(entry)
        }
      }
    }
    if ('clearResourceTimings' in performance) {
      performance.clearResourceTimings()
    }
  })

  function emitResourceEntry(entry: RumPerformanceResourceTiming) {
    if (!isAllowedPerformanceResource(entry)) {
      return 'invalid'
    }

    if (hasSeenResourceEntry(seenResourceEntryKeys, entry)) {
      return 'duplicate'
    }

    const duration = computeResourceEntryDuration(entry)
    const eventTime = entry.responseEnd
    const rawEvent: AllowedRawRumEvent = {
      date: getTimeStamp(entry.startTime),
      type: RumEventType.RESOURCE,
      resource: {
        id: generateUUID(),
        duration: toServerDuration(duration),
        type: computeResourceEntryType(entry),
        url: entry.name,
        status_code: discardZeroStatus(entry.responseStatus),
        protocol: computeResourceEntryProtocol(entry),
        delivery_type: computeResourceEntryDeliveryType(entry),
        render_blocking_status: entry.renderBlockingStatus,
        ...computeResourceEntrySize(entry),
        ...computeResourceEntryDetails(entry),
      },
      _dd: {},
    }

    options.addEvent(eventTime, rawEvent, { performanceEntry: entry }, duration)
    rememberResourceEntry(seenResourceEntryKeys, entry)
    return 'emitted'
  }

  return {
    stop() {
      readyStateSubscription.stop()
      resourcePollSubscription.unsubscribe()
      resourceTimingBufferFullSubscription.stop()
    },
  }
}

function addResourceTimingBufferFullListener(
  configuration: Pick<RumInitConfiguration, 'allowUntrustedEvents'>,
  listener: () => void
) {
  if (!window.performance || !('addEventListener' in performance)) {
    return { stop: NOOP_STOP_CALLBACK }
  }

  return addEventListener(configuration, performance, 'resourcetimingbufferfull', listener)
}

function runOnInteractiveReadyState(
  configuration: Pick<RumInitConfiguration, 'allowUntrustedEvents'>,
  callback: () => void
) {
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    callback()
    return { stop: NOOP_STOP_CALLBACK }
  }

  return addEventListener(configuration, window, DOM_EVENT.DOM_CONTENT_LOADED, callback, { once: true })
}

function getPerformanceResourceEntries() {
  try {
    return performance.getEntriesByType('resource') as RumPerformanceResourceTiming[]
  } catch {
    return undefined
  }
}

function hasResponseEndedAfterViewStart(
  entry: { responseEnd?: number },
  viewStartRelativeTime: RelativeTime
): entry is { responseEnd: RelativeTime } {
  return typeof entry.responseEnd === 'number' && entry.responseEnd >= viewStartRelativeTime
}

function getNavigationResourceEntry(): RumPerformanceNavigationTimingLike | undefined {
  if (!window.performance) {
    return undefined
  }

  const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (navigationEntry) {
    return navigationEntry as unknown as RumPerformanceNavigationTimingLike
  }

  const timing = performance.timing
  if (!timing) {
    return undefined
  }

  const navigationStart = (timing.navigationStart || performance.timeOrigin) as TimeStamp
  const toRelative = (timestamp: number) =>
    (timestamp === 0 ? 0 : timestamp - navigationStart) as RelativeTime

  return {
    name: window.location.href,
    startTime: 0 as RelativeTime,
    responseEnd: toRelative(timing.responseEnd),
    fetchStart: toRelative(timing.fetchStart),
    workerStart: 0 as RelativeTime,
    domainLookupStart: toRelative(timing.domainLookupStart),
    domainLookupEnd: toRelative(timing.domainLookupEnd),
    connectStart: toRelative(timing.connectStart),
    secureConnectionStart: toRelative(timing.secureConnectionStart),
    connectEnd: toRelative(timing.connectEnd),
    requestStart: toRelative(timing.requestStart),
    responseStart: toRelative(timing.responseStart),
    redirectStart: toRelative(timing.redirectStart),
    redirectEnd: toRelative(timing.redirectEnd),
    decodedBodySize: 0,
    encodedBodySize: 0,
    transferSize: 0,
  }
}

function getInitialDocumentResourceTiming(
  navigationEntry: RumPerformanceNavigationTimingLike | undefined
): RumPerformanceResourceTiming | undefined {
  if (!navigationEntry) {
    return undefined
  }

  const duration = navigationEntry.responseEnd

  return {
    ...navigationEntry,
    entryType: 'resource',
    initiatorType: INITIAL_DOCUMENT_INITIATOR_TYPE,
    duration,
    toJSON: () => ({
      name: navigationEntry.name,
      entryType: 'resource',
      startTime: navigationEntry.startTime,
      duration,
    }),
  }
}

function createBoundedKeyStore() {
  return {
    keys: new Set<string>(),
    queue: [] as string[],
  }
}

function hasSeenResourceEntry(store: ReturnType<typeof createBoundedKeyStore>, entry: RumPerformanceResourceTiming) {
  return store.keys.has(getResourceEntryKey(entry))
}

function rememberResourceEntry(store: ReturnType<typeof createBoundedKeyStore>, entry: RumPerformanceResourceTiming) {
  const key = getResourceEntryKey(entry)
  if (store.keys.has(key)) {
    return
  }

  store.keys.add(key)
  store.queue.push(key)

  if (store.queue.length > MAX_SEEN_RESOURCE_KEYS) {
    const oldestKey = store.queue.shift()
    if (oldestKey) {
      store.keys.delete(oldestKey)
    }
  }
}

function getResourceEntryKey(entry: RumPerformanceResourceTiming) {
  return [entry.name, entry.initiatorType, entry.startTime, entry.responseEnd].join('|')
}

function isAllowedPerformanceResource(entry: RumPerformanceResourceTiming) {
  return isAllowedRequestUrl(entry.name) && hasValidResourceEntryDuration(entry) && hasValidResourceEntryTimings(entry)
}

function isAllowedRequestUrl(url: string) {
  return url && !isIntakeUrl(url)
}

function discardZeroStatus(statusCode: number | undefined) {
  return statusCode === 0 ? undefined : statusCode
}

function computeResourceEntryType(entry: RumPerformanceResourceTiming) {
  if (entry.initiatorType === INITIAL_DOCUMENT_INITIATOR_TYPE) {
    return ResourceType.DOCUMENT
  }

  if (entry.initiatorType === 'xmlhttprequest') {
    return ResourceType.XHR
  }

  if (entry.initiatorType === 'fetch') {
    return ResourceType.FETCH
  }

  if (entry.initiatorType === 'beacon') {
    return ResourceType.BEACON
  }

  const lowerCasePath = getUrlPath(entry.name)?.toLowerCase()

  if (lowerCasePath?.endsWith('.css')) {
    return ResourceType.CSS
  }

  if (lowerCasePath?.endsWith('.js')) {
    return ResourceType.JS
  }

  if (/\.(gif|jpg|jpeg|tiff|png|svg|ico)$/i.test(lowerCasePath || '') || ['image', 'img', 'icon'].includes(entry.initiatorType)) {
    return ResourceType.IMAGE
  }

  if (/\.(woff|eot|woff2|ttf)$/i.test(lowerCasePath || '')) {
    return ResourceType.FONT
  }

  if (/\.(mp3|mp4)$/i.test(lowerCasePath || '') || ['audio', 'video'].includes(entry.initiatorType)) {
    return ResourceType.MEDIA
  }

  return ResourceType.OTHER
}

function getUrlPath(url: string) {
  try {
    return buildUrl(url).pathname
  } catch {
    return undefined
  }
}

function computeResourceEntryDuration(entry: RumPerformanceResourceTiming): Duration {
  if (entry.duration === 0 && entry.startTime < entry.responseEnd) {
    return (entry.responseEnd - entry.startTime) as Duration
  }

  return entry.duration
}

function computeResourceEntryDetails(entry: RumPerformanceResourceTiming) {
  if (!hasValidResourceEntryTimings(entry)) {
    return {}
  }

  const details = {
    download: formatTiming(entry.startTime, entry.responseStart, entry.responseEnd),
    first_byte: formatTiming(entry.startTime, entry.requestStart, entry.responseStart),
    worker: undefined as ReturnType<typeof formatTiming> | undefined,
    redirect: undefined as ReturnType<typeof formatTiming> | undefined,
    dns: undefined as ReturnType<typeof formatTiming> | undefined,
    connect: undefined as ReturnType<typeof formatTiming> | undefined,
    ssl: undefined as ReturnType<typeof formatTiming> | undefined,
  }

  if (0 < entry.workerStart && entry.workerStart < entry.fetchStart) {
    details.worker = formatTiming(entry.startTime, entry.workerStart, entry.fetchStart)
  }

  if (entry.fetchStart < entry.connectEnd) {
    details.connect = formatTiming(entry.startTime, entry.connectStart, entry.connectEnd)

    if (entry.connectStart <= entry.secureConnectionStart && entry.secureConnectionStart <= entry.connectEnd) {
      details.ssl = formatTiming(entry.startTime, entry.secureConnectionStart, entry.connectEnd)
    }
  }

  if (entry.fetchStart < entry.domainLookupEnd) {
    details.dns = formatTiming(entry.startTime, entry.domainLookupStart, entry.domainLookupEnd)
  }

  if (entry.startTime < entry.redirectEnd) {
    details.redirect = formatTiming(entry.startTime, entry.redirectStart, entry.redirectEnd)
  }

  return details
}

function computeResourceEntryProtocol(entry: RumPerformanceResourceTiming) {
  return entry.nextHopProtocol === '' ? undefined : entry.nextHopProtocol
}

function computeResourceEntryDeliveryType(entry: RumPerformanceResourceTiming) {
  return entry.deliveryType === '' ? 'other' : entry.deliveryType
}

function computeResourceEntrySize(entry: RumPerformanceResourceTiming) {
  if (entry.startTime < entry.responseStart) {
    return {
      size: entry.decodedBodySize,
      encoded_body_size: entry.encodedBodySize,
      decoded_body_size: entry.decodedBodySize,
      transfer_size: entry.transferSize,
    }
  }

  return {
    size: undefined,
    encoded_body_size: undefined,
    decoded_body_size: undefined,
    transfer_size: undefined,
  }
}

function hasValidResourceEntryDuration(entry: RumPerformanceResourceTiming) {
  return entry.duration >= 0
}

function hasValidResourceEntryTimings(entry: RumPerformanceResourceTiming) {
  const commonTimings = [
    entry.startTime,
    entry.fetchStart,
    entry.domainLookupStart,
    entry.domainLookupEnd,
    entry.connectStart,
    entry.connectEnd,
    entry.requestStart,
    entry.responseStart,
    entry.responseEnd,
  ]

  if (!areInOrder(commonTimings)) {
    return false
  }

  if (entry.redirectEnd <= entry.startTime) {
    return true
  }

  return areInOrder([entry.startTime, entry.redirectStart, entry.redirectEnd, entry.fetchStart])
}

function areInOrder(values: number[]) {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] > values[index]) {
      return false
    }
  }

  return true
}

function formatTiming(origin: RelativeTime, start: RelativeTime, end: RelativeTime) {
  if (origin <= start && start <= end) {
    return {
      duration: toServerDuration((end - start) as Duration),
      start: toServerDuration((start - origin) as Duration),
    }
  }
}
