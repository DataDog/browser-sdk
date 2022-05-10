import { isExperimentalFeatureEnabled } from '../domain/configuration'
import { addMonitoringMessage, monitor } from '../domain/internalMonitoring'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

const FAILED_SEND_BEACON_FLUSH_INTERVAL = 2000
export const LOCAL_STORAGE_KEY = 'datadog-browser-sdk-failed-send-beacon'

export function startFlushFailedSendBeacons() {
  if (!isExperimentalFeatureEnabled('lower-batch-size')) return

  setInterval(monitor(flushFailedSendBeacon), FAILED_SEND_BEACON_FLUSH_INTERVAL)
}

export function addFailedSendBeacon(endpointType: string, size: number, reason?: string) {
  if (!isExperimentalFeatureEnabled('lower-batch-size')) return

  const requests = getFailedSendBeacons()
  requests.push({
    reason,
    endpointType,
    version: __BUILD_ENV__SDK_VERSION__,
    connection: navigator.connection ? (navigator.connection as any).effectiveType : undefined,
    onLine: navigator.onLine,
    size,
  })
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(requests))
}

function getFailedSendBeacons(): any[] {
  return JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_KEY) || '[]') as any[]
}

function flushFailedSendBeacon() {
  getFailedSendBeacons().forEach((result) => addMonitoringMessage('failed sendBeacon', result))
  window.localStorage.clear()
}
