import { display, fetch, setInterval, clearInterval } from '@datadog/browser-core'
import { addProbe, removeProbe } from './probes'
import type { Probe } from './probes'

declare const __BUILD_ENV__SDK_VERSION__: string

const DELIVERY_API_PATH = '/api/ui/debugger/probe-delivery'
const DEFAULT_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Accept': 'application/vnd.datadog.debugger-probes+json; version=1',
}

export interface DeliveryApiConfiguration {
  applicationId: string
  env?: string
  version?: string
  pollInterval?: number
}

interface DeliveryApiResponse {
  nextCursor: string
  updates: Probe[]
  deletions: string[]
}

let pollIntervalId: number | undefined
let currentCursor: string | undefined
let knownProbeIds = new Set<string>()

/**
 * Start polling the Datadog Delivery API for probe updates.
 *
 * This is designed for dogfooding the Live Debugger inside the Datadog web UI,
 * where the user is already authenticated via session cookies (ValidUser auth).
 * Requests are same-origin, so no explicit domain is needed.
 */
export function startDeliveryApiPolling(config: DeliveryApiConfiguration): void {
  if (pollIntervalId !== undefined) {
    display.warn('Live Debugger: Delivery API polling already started')
    return
  }

  const pollInterval = config.pollInterval || 60_000

  const baseRequestBody = {
    applicationId: config.applicationId,
    clientName: 'browser',
    clientVersion: __BUILD_ENV__SDK_VERSION__,
    env: config.env,
    serviceVersion: config.version,
  }

  const poll = async () => {
    try {
      const body: Record<string, unknown> = { ...baseRequestBody }
      if (currentCursor) {
        body.nextCursor = currentCursor
      }

      const response = await fetch(DELIVERY_API_PATH, {
        method: 'POST',
        headers: { ...DEFAULT_HEADERS },
        body: JSON.stringify(body),
        credentials: 'same-origin',
      })

      if (!response.ok) {
        // TODO: Remove response body logging once dogfooding is complete
        let errorBody = ''
        try {
          errorBody = await response.text()
        } catch {
          // ignore
        }
        display.error(`Live Debugger: Delivery API poll failed with status ${response.status}`, errorBody)
        return
      }

      const data: DeliveryApiResponse = await response.json()

      if (data.nextCursor) {
        currentCursor = data.nextCursor
      }

      for (const probeId of data.deletions || []) {
        if (knownProbeIds.has(probeId)) {
          try {
            removeProbe(probeId)
            knownProbeIds.delete(probeId)
          } catch (err) {
            display.error(`Live Debugger: Failed to remove probe ${probeId}:`, err as Error)
          }
        }
      }

      for (const probe of data.updates || []) {
        if (!probe.id) {
          continue
        }

        if (knownProbeIds.has(probe.id)) {
          try {
            removeProbe(probe.id)
          } catch {
            // Probe may have been removed by a deletion in the same response
          }
        }

        try {
          addProbe(probe)
          knownProbeIds.add(probe.id)
        } catch (err) {
          display.error(`Live Debugger: Failed to add probe ${probe.id}:`, err as Error)
        }
      }
    } catch (err) {
      display.error('Live Debugger: Delivery API poll error:', err as Error)
    }
  }

  void poll()

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  pollIntervalId = setInterval(poll, pollInterval)
}

export function stopDeliveryApiPolling(): void {
  if (pollIntervalId !== undefined) {
    clearInterval(pollIntervalId)
    pollIntervalId = undefined
  }
}

export function clearDeliveryApiState(): void {
  currentCursor = undefined
  knownProbeIds = new Set<string>()
  if (pollIntervalId !== undefined) {
    clearInterval(pollIntervalId)
    pollIntervalId = undefined
  }
}
