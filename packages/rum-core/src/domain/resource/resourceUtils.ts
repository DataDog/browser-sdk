import type { RelativeTime, ServerDuration } from '@datadog/browser-core'
import {
  addTelemetryDebug,
  elapsed,
  getPathName,
  includes,
  isValidUrl,
  ResourceType,
  toServerDuration,
} from '@datadog/browser-core'

import type { RumPerformanceResourceTiming } from '../../browser/performanceCollection'

import type { PerformanceResourceDetailsElement } from '../../rawRumEvent.types'
import type { RumConfiguration } from '../configuration'

export interface PerformanceResourceDetails {
  redirect?: PerformanceResourceDetailsElement
  dns?: PerformanceResourceDetailsElement
  connect?: PerformanceResourceDetailsElement
  ssl?: PerformanceResourceDetailsElement
  first_byte: PerformanceResourceDetailsElement
  download: PerformanceResourceDetailsElement
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

export function computeResourceKind(timing: RumPerformanceResourceTiming) {
  const url = timing.name
  if (!isValidUrl(url)) {
    addTelemetryDebug(`Failed to construct URL for "${timing.name}"`)
    return ResourceType.OTHER
  }
  const path = getPathName(url)
  for (const [type, isType] of RESOURCE_TYPES) {
    if (isType(timing.initiatorType, path)) {
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

export function isRequestKind(timing: RumPerformanceResourceTiming) {
  return timing.initiatorType === 'xmlhttprequest' || timing.initiatorType === 'fetch'
}

export function computePerformanceResourceDuration(entry: RumPerformanceResourceTiming): ServerDuration {
  const { duration, startTime, responseEnd } = entry

  // Safari duration is always 0 on timings blocked by cross origin policies.
  if (duration === 0 && startTime < responseEnd) {
    return toServerDuration(elapsed(startTime, responseEnd))
  }

  return toServerDuration(duration)
}

export function computePerformanceResourceDetails(
  entry: RumPerformanceResourceTiming
): PerformanceResourceDetails | undefined {
  const validEntry = toValidEntry(entry)

  if (!validEntry) {
    return undefined
  }
  const {
    startTime,
    fetchStart,
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
  } = validEntry

  const details: PerformanceResourceDetails = {
    download: formatTiming(startTime, responseStart, responseEnd),
    first_byte: formatTiming(startTime, requestStart, responseStart),
  }

  // Make sure a connection occurred
  if (connectEnd !== fetchStart) {
    details.connect = formatTiming(startTime, connectStart, connectEnd)

    // Make sure a secure connection occurred
    if (areInOrder(connectStart, secureConnectionStart, connectEnd)) {
      details.ssl = formatTiming(startTime, secureConnectionStart, connectEnd)
    }
  }

  // Make sure a domain lookup occurred
  if (domainLookupEnd !== fetchStart) {
    details.dns = formatTiming(startTime, domainLookupStart, domainLookupEnd)
  }

  if (hasRedirection(entry)) {
    details.redirect = formatTiming(startTime, redirectStart, redirectEnd)
  }

  return details
}

export function toValidEntry(entry: RumPerformanceResourceTiming) {
  // Ensure timings are in the right order. On top of filtering out potential invalid
  // RumPerformanceResourceTiming, it will ignore entries from requests where timings cannot be
  // collected, for example cross origin requests without a "Timing-Allow-Origin" header allowing
  // it.
  if (
    areInOrder(
      entry.startTime,
      entry.fetchStart,
      entry.domainLookupStart,
      entry.domainLookupEnd,
      entry.connectStart,
      entry.connectEnd,
      entry.requestStart,
      entry.responseStart,
      entry.responseEnd
    ) &&
    (!hasRedirection(entry) || areInOrder(entry.startTime, entry.redirectStart, entry.redirectEnd, entry.fetchStart))
  ) {
    return entry
  }
}

function hasRedirection(entry: RumPerformanceResourceTiming) {
  return entry.redirectEnd > entry.startTime
}

function formatTiming(origin: RelativeTime, start: RelativeTime, end: RelativeTime) {
  return {
    duration: toServerDuration(elapsed(start, end)),
    start: toServerDuration(elapsed(origin, start)),
  }
}

export function computeSize(entry: RumPerformanceResourceTiming) {
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

export function isAllowedRequestUrl(configuration: RumConfiguration, url: string) {
  return url && !configuration.isIntakeUrl(url)
}
