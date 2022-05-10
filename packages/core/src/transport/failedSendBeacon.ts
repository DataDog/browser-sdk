import { isExperimentalFeatureEnabled } from '../domain/configuration'
import { addMonitoringMessage, monitor } from '../domain/internalMonitoring'

const FAILED_SEND_BEACON_FLUSH_INTERVAL = 2000

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
    connection: navigator.connection ? (navigator.connection as any).effectiveType : undefined,
    size,
  })
  window.localStorage.setItem('failed-send-beacon', JSON.stringify(requests))
}

function getFailedSendBeacons(): any[] {
  return JSON.parse(window.localStorage.getItem('failed-send-beacon') || '[]') as any[]
}

function flushFailedSendBeacon() {
  getFailedSendBeacons().forEach((result) => addMonitoringMessage('failed sendBeacon', result))
  window.localStorage.clear()
}
