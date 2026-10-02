import { globalObject } from '@datadog/js-core/util'
import { monitorError } from '@datadog/js-core/monitor'
import { generateUUID, isError } from '@datadog/browser-core'
import type { InitializedProbe } from './probes'
import { safeReadErrorProperty } from './error'

interface RumActionOptions {
  actionKey?: string
  context?: object
}

interface Rum {
  startAction?: (name: string, options?: RumActionOptions) => void
  stopAction?: (name: string, options?: RumActionOptions) => void
}

interface BrowserWindow {
  DD_RUM?: Rum
}

/**
 * A RUM custom action started for a probe hit, linked to the snapshot sent for the same hit.
 */
export interface ProbeRumAction {
  name: string
  snapshotId: string
}

/**
 * Start a RUM custom action for the first qualifying hit of a probe instance: one that passed
 * sampling and its condition. Only ENTRY probes are supported, as the RUM API can't backdate the
 * start of an action once an EXIT condition is known.
 *
 * The probe stays armed when RUM isn't on the page, so a later hit can still create the action.
 *
 * @returns The started action, or undefined if none was started
 */
export function startProbeRumAction(probe: InitializedProbe): ProbeRumAction | undefined {
  if (probe.rumActionStarted || probe.evaluateAt !== 'ENTRY') {
    return
  }

  const rum = (globalObject as BrowserWindow).DD_RUM
  if (!rum?.startAction || !rum.stopAction) {
    return
  }

  probe.rumActionStarted = true

  const action: ProbeRumAction = {
    name: `probe: ${probe.where.methodName} (${probe.where.typeName})`,
    snapshotId: generateUUID(),
  }

  try {
    rum.startAction(action.name, {
      // Unique per hit, so an in-flight action can't be stopped by a replacement probe instance
      actionKey: action.snapshotId,
      context: {
        debugger: {
          probe: {
            id: probe.id,
            version: probe.version,
            location: {
              method: probe.where.methodName,
              type: probe.where.typeName,
            },
          },
          snapshot: { id: action.snapshotId },
        },
      },
    })
  } catch (error) {
    monitorError(error)
  }

  return action
}

/**
 * Stop a RUM custom action started by {@link startProbeRumAction} when the instrumented function
 * returns or throws.
 */
export function stopProbeRumAction(action: ProbeRumAction, outcome: 'return' | 'throw', error?: unknown): void {
  try {
    const errorType = outcome === 'throw' ? getErrorType(error) : undefined
    ;(globalObject as BrowserWindow).DD_RUM?.stopAction?.(action.name, {
      actionKey: action.snapshotId,
      context: {
        debugger: {
          outcome,
          error: errorType === undefined ? undefined : { type: errorType },
        },
      },
    })
  } catch (error) {
    monitorError(error)
  }
}

function getErrorType(error: unknown): string | undefined {
  return isError(error) ? safeReadErrorProperty(error, 'name') : undefined
}
