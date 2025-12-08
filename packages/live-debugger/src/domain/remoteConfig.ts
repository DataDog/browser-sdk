import { display, setInterval, clearInterval } from '@datadog/browser-core'
import type { LiveDebuggerInitConfiguration } from '../entries/main'
import { addProbe, removeProbe } from './probes'
import type { Probe } from './probes'

/**
 * Remote Config Client for Browser Live Debugger
 * 
 * Polls the RC proxy periodically to get probe updates and synchronizes
 * the local probe registry.
 * 
 * NOTE: The RC proxy can operate in two modes:
 * - agent mode: Polls local Datadog agent (for POC/development, no CORS issues)
 * - backend mode: Polls Datadog RC backend directly (requires backend access)
 */

interface ProbeState {
  id: string
  version: number
}

let pollIntervalId: number | undefined
let currentProbeStates = new Map<string, ProbeState>() // Track probes by ID and version

/**
 * Start polling the Remote Config proxy for probe updates
 *
 * @param config - Live Debugger configuration
 */
export function startRemoteConfigPolling(config: LiveDebuggerInitConfiguration): void {
  if (pollIntervalId !== undefined) {
    display.warn('Live Debugger: Remote Config polling already started')
    return
  }

  const proxyUrl = config.remoteConfigProxyUrl!
  const pollInterval = config.remoteConfigPollInterval || 5000

  display.info(`Live Debugger: Starting Remote Config polling (${proxyUrl}, interval: ${pollInterval}ms)`)

  // Build query string with service metadata
  const params = new URLSearchParams()
  params.set('service', config.service!)
  if (config.env) {
    params.set('env', config.env)
  }
  if (config.version) {
    params.set('version', config.version)
  }

  const pollUrl = `${proxyUrl}/probes?${params.toString()}`

  // Polling function
  const poll = async () => {
    try {
      const response = await fetch(pollUrl)

      if (!response.ok) {
        display.error(`Live Debugger: RC poll failed with status ${response.status}`)
        return
      }

      const data = await response.json()
      const probes: Probe[] = data.probes || []

      // Synchronize probes
      synchronizeProbes(probes)
    } catch (err) {
      display.error('Live Debugger: RC poll error:', err as Error)
    }
  }

  // Initial poll
  void poll()

  // Start polling interval
  pollIntervalId = setInterval(() => {
    void poll()
  }, pollInterval)
}

/**
 * Stop Remote Config polling
 */
export function stopRemoteConfigPolling(): void {
  if (pollIntervalId !== undefined) {
    clearInterval(pollIntervalId)
    pollIntervalId = undefined
    display.info('Live Debugger: Remote Config polling stopped')
  }
}

/**
 * Synchronize local probes with probes from RC proxy
 * 
 * - Adds new probes
 * - Removes probes no longer in the response
 * - Updates probes if version changed
 * 
 * @param probes - Array of probes from RC proxy
 */
function synchronizeProbes(probes: Probe[]): void {
  const newProbeStates = new Map<string, ProbeState>()

  // Process probes from RC
  for (const probe of probes) {
    if (!probe.id) {
      display.warn('Live Debugger: Received probe without ID, skipping')
      continue
    }

    const probeState: ProbeState = {
      id: probe.id,
      version: probe.version
    }
    newProbeStates.set(probe.id, probeState)

    const currentState = currentProbeStates.get(probe.id)

    if (!currentState) {
      // New probe - add it
      try {
        addProbe(probe)
        display.log(`Live Debugger: Added probe ${probe.id} (v${probe.version})`)
      } catch (err) {
        display.error(`Live Debugger: Failed to add probe ${probe.id}:`, err as Error)
      }
    } else if (currentState.version !== probe.version) {
      // Probe version changed - remove old and add new
      try {
        removeProbe(probe.id)
        addProbe(probe)
        display.log(`Live Debugger: Updated probe ${probe.id} (v${currentState.version} -> v${probe.version})`)
      } catch (err) {
        display.error(`Live Debugger: Failed to update probe ${probe.id}:`, err as Error)
      }
    }
    // If version is the same, probe already exists - no action needed
  }

  // Remove probes that are no longer in RC response
  for (const [probeId, currentState] of currentProbeStates.entries()) {
    if (!newProbeStates.has(probeId)) {
      try {
        removeProbe(probeId)
        display.log(`Live Debugger: Removed probe ${probeId} (v${currentState.version})`)
      } catch (err) {
        display.error(`Live Debugger: Failed to remove probe ${probeId}:`, err as Error)
      }
    }
  }

  // Update current state
  currentProbeStates = newProbeStates

  display.log(`Live Debugger: Synchronized ${newProbeStates.size} probe(s)`)
}

/**
 * Get current Remote Config polling status
 *
 * @returns true if polling is active
 */
export function isRemoteConfigPolling(): boolean {
  return pollIntervalId !== undefined
}

/**
 * Clear probe state (useful for testing)
 */
export function clearRemoteConfigState(): void {
  currentProbeStates.clear()
  if (pollIntervalId !== undefined) {
    clearInterval(pollIntervalId)
    pollIntervalId = undefined
  }
}

