import { addMonitoringMessage, Configuration, includes, msToNs, ResourceKind, startsWith } from '@datadog/browser-core'

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

const durationPairs: Array<[keyof PerformanceResourceTiming, keyof PerformanceResourceTiming]> = [
  ['connectStart', 'connectEnd'],
  ['domainLookupStart', 'domainLookupEnd'],
  ['responseStart', 'responseEnd'],
  ['requestStart', 'responseStart'],
  ['redirectStart', 'redirectEnd'],
  ['secureConnectionStart', 'connectEnd'],
]
function reporteAbnormalEntry(entry: PerformanceResourceTiming) {
  let error = ''
  for (const [start, end] of durationPairs) {
    if (entry[start] < 0) {
      error += `${start} is negative\n`
    } else if (entry[start] > entry[end]) {
      error += `${start} is greater than ${end}\n`
    }
  }
  if (error) {
    addMonitoringMessage(`Got an abnormal PerformanceResourceTiming:
${error}
Entry: ${JSON.stringify(entry)}`)
  }
}

function formatTiming(start: number, end: number) {
  if (start <= 0 || end <= 0 || end < start) {
    return undefined
  }
  return { duration: msToNs(end - start), start: msToNs(start) }
}

export function computePerformanceResourceDetails(
  entry?: PerformanceResourceTiming
): PerformanceResourceDetails | undefined {
  if (entry && hasTimingAllowedAttributes(entry)) {
    reporteAbnormalEntry(entry)
    return {
      connect: formatTiming(entry.connectStart, entry.connectEnd),
      dns: formatTiming(entry.domainLookupStart, entry.domainLookupEnd),
      download: formatTiming(entry.responseStart, entry.responseEnd),
      firstByte: formatTiming(entry.requestStart, entry.responseStart),
      redirect: formatTiming(entry.redirectStart, entry.redirectEnd),
      ssl: formatTiming(entry.secureConnectionStart, entry.connectEnd),
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
