import type { TimeoutId, Site } from '@datadog/browser-core'
import {
  display,
  fetch,
  getGlobalObject,
  mockable,
  setInterval,
  clearInterval,
  INTAKE_SITE_US1,
} from '@datadog/browser-core'
import { addProbe, removeProbe } from './probes'
import type { Probe } from './probes'

declare const __BUILD_ENV__SDK_VERSION__: string

const DELIVERY_API_PATH = '/api/unstable/debugger/frontend/probes'

export interface DeliveryApiConfiguration {
  service: string
  clientToken: string
  site?: Site
  proxy?: string
  env?: string
  version?: string
  pollInterval?: number
}

export function buildDeliveryApiUrl(site: Site = INTAKE_SITE_US1, proxy?: string): string {
  if (proxy) {
    return `${proxy}${DELIVERY_API_PATH}`
  }
  return `https://api.${site}${DELIVERY_API_PATH}`
}

interface DeliveryApiResponse {
  nextCursor: string
  updates: Probe[]
  deletions: string[]
}

let pollIntervalId: TimeoutId | undefined
let currentCursor: string | undefined
let knownProbeIds = new Set<string>()

/**
 * Start polling the Datadog Delivery API for probe updates.
 *
 * Requests are authenticated via `dd-client-token` header (ClientTokenAuth)
 * against the public Smart Edge route.
 */
export function startDeliveryApiPolling(config: DeliveryApiConfiguration): void {
  if (!('location' in mockable(getGlobalObject)())) {
    return
  }

  if (pollIntervalId !== undefined) {
    display.warn('Debugger: Delivery API polling already started')
    return
  }

  const pollInterval = config.pollInterval || 60_000
  const url = buildDeliveryApiUrl(config.site, config.proxy)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/vnd.datadog.debugger-probes+json; version=1',
    'dd-client-token': config.clientToken,
  }

  const baseRequestBody = {
    service: config.service,
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

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        // TODO: Remove response body logging once dogfooding is complete
        let errorBody = ''
        try {
          errorBody = await response.text()
        } catch {
          // ignore
        }
        display.error(`Debugger: Delivery API poll failed with status ${response.status}`, errorBody)
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
            display.error(`Debugger: Failed to remove probe ${probeId}:`, err as Error)
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
          display.error(`Debugger: Failed to add probe ${probe.id}:`, err as Error)
        }
      }
    } catch (err) {
      display.error('Debugger: Delivery API poll error:', err as Error)
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
