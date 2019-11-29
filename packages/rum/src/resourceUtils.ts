import { addMonitoringMessage, Configuration, includes, msToNs, ResourceKind, startsWith } from '@browser-agent/core'

import { PerformanceResourceDetails } from './rum'

const RESOURCE_TYPES: Array<[ResourceKind, (initiatorType: string, path: string) => boolean]> = [
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
  if (entry && hasTimingAllowedAttributes(entry)) {
    return {
      connect: { duration: msToNs(entry.connectEnd - entry.connectStart), start: msToNs(entry.connectStart) },
      dns: {
        duration: msToNs(entry.domainLookupEnd - entry.domainLookupStart),
        start: msToNs(entry.domainLookupStart),
      },
      download: { duration: msToNs(entry.responseEnd - entry.responseStart), start: msToNs(entry.responseStart) },
      firstByte: { duration: msToNs(entry.responseStart - entry.requestStart), start: msToNs(entry.requestStart) },
      redirect:
        entry.redirectStart > 0
          ? { duration: msToNs(entry.redirectEnd - entry.redirectStart), start: msToNs(entry.redirectStart) }
          : undefined,
      ssl:
        entry.secureConnectionStart > 0
          ? {
              duration: msToNs(entry.connectEnd - entry.secureConnectionStart),
              start: msToNs(entry.secureConnectionStart),
            }
          : undefined,
    }
  }
  return undefined
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
