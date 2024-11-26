import type { RelativeTime, ServerDuration } from '@datadog/browser-core'
import {
  addTelemetryDebug,
  elapsed,
  getPathName,
  includes,
  isValidUrl,
  ResourceType,
  toServerDuration,
  isIntakeUrl,
} from '@datadog/browser-core'

import type { RumPerformanceResourceTiming } from '../../browser/performanceObservable'

import type { deliveryType, ResourceEntryDetailsElement } from '../../rawRumEvent.types'

export interface ResourceEntryDetails {
  worker?: ResourceEntryDetailsElement
  redirect?: ResourceEntryDetailsElement
  dns?: ResourceEntryDetailsElement
  connect?: ResourceEntryDetailsElement
  ssl?: ResourceEntryDetailsElement
  first_byte?: ResourceEntryDetailsElement
  download?: ResourceEntryDetailsElement
}

export const FAKE_INITIAL_DOCUMENT = 'initial_document'

const RESOURCE_TYPES: Array<[ResourceType, (initiatorType: string, path: string) => boolean]> = [
  [ResourceType.DOCUMENT, (initiatorType: string) => FAKE_INITIAL_DOCUMENT === initiatorType],
  [ResourceType.XHR, (initiatorType: string) => 'xmlhttprequest' === initiatorType],
  [ResourceType.FETCH, (initiatorType: string) => 'fetch' === initiatorType],
  [ResourceType.BEACON, (initiatorType: string) => 'beacon' === initiatorType],
  [ResourceType.CSS, (_: string, path: string) => /\.css$/i.test(path)],
  [ResourceType.JS, (_: string, path: string) => /\.js$/i.test(path)],
  [
    ResourceType.IMAGE,
    (initiatorType: string, path: string) =>
      includes(['image', 'img', 'icon'], initiatorType) || /\.(gif|jpg|jpeg|tiff|png|svg|ico)$/i.exec(path) !== null,
  ],
  [ResourceType.FONT, (_: string, path: string) => /\.(woff|eot|woff2|ttf)$/i.exec(path) !== null],
  [
    ResourceType.MEDIA,
    (initiatorType: string, path: string) =>
      includes(['audio', 'video'], initiatorType) || /\.(mp3|mp4)$/i.exec(path) !== null,
  ],
]

export function computeResourceEntryType(entry: RumPerformanceResourceTiming) {
  const url = entry.name
  if (!isValidUrl(url)) {
    addTelemetryDebug(`Failed to construct URL for "${entry.name}"`)
    return ResourceType.OTHER
  }
  const path = getPathName(url)
  for (const [type, isType] of RESOURCE_TYPES) {
    if (isType(entry.initiatorType, path)) {
      return type
    }
  }
  return ResourceType.OTHER
}

function areInOrder(...numbers: number[]) {
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i - 1] > numbers[i]) {
      return false
    }
  }
  return true
}

export function isResourceEntryRequestType(entry: RumPerformanceResourceTiming) {
  return entry.initiatorType === 'xmlhttprequest' || entry.initiatorType === 'fetch'
}

export function computeResourceEntryDuration(entry: RumPerformanceResourceTiming): ServerDuration {
  const { duration, startTime, responseEnd } = entry

  // Safari duration is always 0 on timings blocked by cross origin policies.
  if (duration === 0 && startTime < responseEnd) {
    return toServerDuration(elapsed(startTime, responseEnd))
  }

  return toServerDuration(duration)
}

export function computeResourceEntryDetails(entry: RumPerformanceResourceTiming): ResourceEntryDetails | undefined {
  if (!hasValidResourceEntryTimings(entry)) {
    return undefined
  }
  const {
    startTime,
    fetchStart,
    workerStart,
    redirectStart,
    redirectEnd,
    domainLookupStart,
    domainLookupEnd,
    connectStart,
    secureConnectionStart,
    connectEnd,
    requestStart,
    responseStart,
    responseEnd,
  } = entry

  const details: ResourceEntryDetails = {
    download: formatTiming(startTime, responseStart, responseEnd),
    first_byte: formatTiming(startTime, requestStart, responseStart),
  }

  // Make sure a worker processing time is recorded
  if (0 < workerStart && workerStart < fetchStart) {
    details.worker = formatTiming(startTime, workerStart, fetchStart)
  }

  // Make sure a connection occurred
  if (fetchStart < connectEnd) {
    details.connect = formatTiming(startTime, connectStart, connectEnd)

    // Make sure a secure connection occurred
    if (connectStart <= secureConnectionStart && secureConnectionStart <= connectEnd) {
      details.ssl = formatTiming(startTime, secureConnectionStart, connectEnd)
    }
  }

  // Make sure a domain lookup occurred
  if (fetchStart < domainLookupEnd) {
    details.dns = formatTiming(startTime, domainLookupStart, domainLookupEnd)
  }

  // Make sure a redirection occurred
  if (startTime < redirectEnd) {
    details.redirect = formatTiming(startTime, redirectStart, redirectEnd)
  }

  return details
}

/**
 * Entries with negative duration are unexpected and should be dismissed. The intake will ignore RUM
 * Resource events with negative durations anyway.
 * Since Chromium 128, more entries have unexpected negative durations, see
 * https://issues.chromium.org/issues/363031537
 */
export function hasValidResourceEntryDuration(entry: RumPerformanceResourceTiming) {
  return entry.duration >= 0
}

export function hasValidResourceEntryTimings(entry: RumPerformanceResourceTiming) {
  // Ensure timings are in the right order. On top of filtering out potential invalid
  // RumPerformanceResourceTiming, it will ignore entries from requests where timings cannot be
  // collected, for example cross origin requests without a "Timing-Allow-Origin" header allowing
  // it.
  const areCommonTimingsInOrder = areInOrder(
    entry.startTime,
    entry.fetchStart,
    entry.domainLookupStart,
    entry.domainLookupEnd,
    entry.connectStart,
    entry.connectEnd,
    entry.requestStart,
    entry.responseStart,
    entry.responseEnd
  )

  const areRedirectionTimingsInOrder = hasRedirection(entry)
    ? areInOrder(entry.startTime, entry.redirectStart, entry.redirectEnd, entry.fetchStart)
    : true

  return areCommonTimingsInOrder && areRedirectionTimingsInOrder
}

function hasRedirection(entry: RumPerformanceResourceTiming) {
  return entry.redirectEnd > entry.startTime
}
function formatTiming(origin: RelativeTime, start: RelativeTime, end: RelativeTime) {
  if (origin <= start && start <= end) {
    return {
      duration: toServerDuration(elapsed(start, end)),
      start: toServerDuration(elapsed(origin, start)),
    }
  }
}

/**
 * The 'nextHopProtocol' is an empty string for cross-origin resources without CORS headers,
 * meaning the protocol is unknown, and we shouldn't report it.
 * https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/nextHopProtocol#cross-origin_resources
 */
export function computeResourceEntryProtocol(entry: RumPerformanceResourceTiming) {
  return entry.nextHopProtocol === '' ? undefined : entry.nextHopProtocol
}

/**
 * Handles the 'deliveryType' property to distinguish between supported values ('cache', 'navigational-prefetch'),
 * undefined (unsupported in some browsers), and other cases ('-' for unknown or unrecognized values).
 * https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/deliveryType
 */
export function computeResourceEntryDeliveryType(entry: RumPerformanceResourceTiming): deliveryType | undefined {
  const deliveryType = entry.deliveryType

  if (deliveryType === undefined) {
    return undefined
  }

  if (deliveryType === 'cache' || deliveryType === 'navigational-prefetch') {
    return deliveryType
  }

  return '-'
}

export function computeResourceEntrySize(entry: RumPerformanceResourceTiming) {
  // Make sure a request actually occurred
  if (entry.startTime < entry.responseStart) {
    const { encodedBodySize, decodedBodySize, transferSize } = entry
    return {
      size: decodedBodySize,
      encoded_body_size: encodedBodySize,
      decoded_body_size: decodedBodySize,
      transfer_size: transferSize,
    }
  }
  return {
    size: undefined,
    encoded_body_size: undefined,
    decoded_body_size: undefined,
    transfer_size: undefined,
  }
}

export function isAllowedRequestUrl(url: string) {
  return url && !isIntakeUrl(url)
}

const DATA_URL_REGEX = /data:(.+)?(;base64)?,/g
export const MAX_ATTRIBUTE_VALUE_CHAR_LENGTH = 24_000

export function isLongDataUrl(url: string): boolean {
  if (url.length <= MAX_ATTRIBUTE_VALUE_CHAR_LENGTH) {
    return false
  } else if (url.substring(0, 5) === 'data:') {
    // Avoid String.match RangeError: Maximum call stack size exceeded
    url = url.substring(0, MAX_ATTRIBUTE_VALUE_CHAR_LENGTH)
    return true
  }
  return false
}

export function sanitizeDataUrl(url: string): string {
  return `${url.match(DATA_URL_REGEX)![0]}[...]`
}
