import { addMonitoringMessage, Configuration, includes, msToNs, ResourceKind } from '@datadog/browser-core'

import { PerformanceResourceDetails } from './rum'

export const FAKE_INITIAL_DOCUMENT = 'initial_document'

const RESOURCE_TYPES: Array<[ResourceKind, (initiatorType: string, path: string) => boolean]> = [
  [ResourceKind.DOCUMENT, (initiatorType: string) => FAKE_INITIAL_DOCUMENT === initiatorType],
  [ResourceKind.XHR, (initiatorType: string) => 'xmlhttprequest' === initiatorType],
  [ResourceKind.FETCH, (initiatorType: string) => 'fetch' === initiatorType],
  [ResourceKind.BEACON, (initiatorType: string) => 'beacon' === initiatorType],
  [ResourceKind.CSS, (_: string, path: string) => path.match(/\.css$/i) !== null],
  [ResourceKind.JS, (_: string, path: string) => path.match(/\.js$/i) !== null],
  [
    ResourceKind.IMAGE,
    (initiatorType: string, path: string) =>
      includes(['image', 'img', 'icon'], initiatorType) || path.match(/\.(gif|jpg|jpeg|tiff|png|svg)$/i) !== null,
  ],
  [ResourceKind.FONT, (_: string, path: string) => path.match(/\.(woff|eot|woff2|ttf)$/i) !== null],
  [
    ResourceKind.MEDIA,
    (initiatorType: string, path: string) =>
      includes(['audio', 'video'], initiatorType) || path.match(/\.(mp3|mp4)$/i) !== null,
  ],
]

export function computeResourceKind(timing: PerformanceResourceTiming) {
  let url: URL | undefined
  try {
    url = new URL(timing.name)
  } catch (e) {
    addMonitoringMessage(`Failed to construct URL for "${timing.name}"`)
  }
  if (url !== undefined) {
    const path = url.pathname
    for (const [type, isType] of RESOURCE_TYPES) {
      if (isType(timing.initiatorType, path)) {
        return type
      }
    }
  }
  return ResourceKind.OTHER
}

export function computePerformanceResourceDetails(
  entry?: PerformanceResourceTiming
): PerformanceResourceDetails | undefined {
  if (!entry || !hasTimingAllowedAttributes(entry)) {
    return undefined
  }
  if (
    !isValidTiming(entry.connectStart, entry.connectEnd) ||
    !isValidTiming(entry.domainLookupStart, entry.domainLookupEnd) ||
    !isValidTiming(entry.responseStart, entry.responseEnd) ||
    !isValidTiming(entry.requestStart, entry.responseStart) ||
    !isValidTiming(entry.redirectStart, entry.redirectEnd) ||
    !isValidTiming(entry.secureConnectionStart, entry.connectEnd)
  ) {
    return undefined
  }
  return {
    connect: isRelevantTiming(entry.connectStart, entry.connectEnd, entry.fetchStart)
      ? formatTiming(entry.connectStart, entry.connectEnd)
      : undefined,
    dns: isRelevantTiming(entry.domainLookupStart, entry.domainLookupEnd, entry.fetchStart)
      ? formatTiming(entry.domainLookupStart, entry.domainLookupEnd)
      : undefined,
    download: formatTiming(entry.responseStart, entry.responseEnd),
    firstByte: formatTiming(entry.requestStart, entry.responseStart),
    redirect: isRelevantTiming(entry.redirectStart, entry.redirectEnd, 0)
      ? formatTiming(entry.redirectStart, entry.redirectEnd)
      : undefined,
    ssl:
      entry.secureConnectionStart !== 0 &&
      isRelevantTiming(entry.secureConnectionStart, entry.connectEnd, entry.fetchStart)
        ? formatTiming(entry.secureConnectionStart, entry.connectEnd)
        : undefined,
  }
}

function isValidTiming(start: number, end: number) {
  return start >= 0 && end >= 0 && end >= start
}

/**
 * Do not collect timing when persistent connection, cache, ...
 * https://developer.mozilla.org/en-US/docs/Web/Performance/Navigation_and_resource_timings
 */
function isRelevantTiming(start: number, end: number, reference: number) {
  return start !== reference || end !== reference
}

function formatTiming(start: number, end: number) {
  return { duration: msToNs(end - start), start: msToNs(start) }
}

export function computeSize(entry?: PerformanceResourceTiming) {
  return entry && hasTimingAllowedAttributes(entry) ? entry.decodedBodySize : undefined
}

function hasTimingAllowedAttributes(timing: PerformanceResourceTiming) {
  return timing.responseStart > 0
}

export function isValidResource(url: string, configuration: Configuration) {
  return url && !isBrowserAgentRequest(url, configuration)
}

function isBrowserAgentRequest(url: string, configuration: Configuration) {
  return (
    haveSameOrigin(url, configuration.logsEndpoint) ||
    haveSameOrigin(url, configuration.rumEndpoint) ||
    haveSameOrigin(url, configuration.traceEndpoint) ||
    (configuration.internalMonitoringEndpoint && haveSameOrigin(url, configuration.internalMonitoringEndpoint))
  )
}

function haveSameOrigin(url1: string, url2: string) {
  return new URL(url1).origin === new URL(url2).origin
}
