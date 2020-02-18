import { addMonitoringMessage, Configuration, includes, msToNs, ResourceKind, startsWith } from '@datadog/browser-core'

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

function formatTiming(start: number, end: number) {
  return { duration: msToNs(end - start), start: msToNs(start) }
}

function isValidTiming(start: number, end: number) {
  return start >= 0 && end >= 0 && end >= start
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
    !isValidTiming(entry.requestStart, entry.responseStart)
  ) {
    return undefined
  }
  return {
    connect: formatTiming(entry.connectStart, entry.connectEnd),
    dns: formatTiming(entry.domainLookupStart, entry.domainLookupEnd),
    download: formatTiming(entry.responseStart, entry.responseEnd),
    firstByte: formatTiming(entry.requestStart, entry.responseStart),
    redirect: isValidTiming(entry.redirectStart, entry.redirectEnd)
      ? formatTiming(entry.redirectStart, entry.redirectEnd)
      : undefined,
    ssl: isValidTiming(entry.secureConnectionStart, entry.connectEnd)
      ? formatTiming(entry.secureConnectionStart, entry.connectEnd)
      : undefined,
  }
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
    startsWith(url, configuration.logsEndpoint) ||
    startsWith(url, configuration.rumEndpoint) ||
    startsWith(url, configuration.traceEndpoint) ||
    (configuration.internalMonitoringEndpoint && startsWith(url, configuration.internalMonitoringEndpoint))
  )
}
