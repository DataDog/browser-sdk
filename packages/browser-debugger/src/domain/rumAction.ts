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
  addAction?: (name: string, context?: object) => void
  startAction?: (name: string, options?: RumActionOptions) => void
  stopAction?: (name: string, options?: RumActionOptions) => void
}

interface BrowserWindow {
  DD_RUM?: Rum
}

/**
 * A RUM custom action created for a probe hit, linked to the snapshot sent for the same hit.
 */
export interface ProbeRumAction {
  name: string
  snapshotId: string
}

/**
 * Start a RUM custom action for the first qualifying hit of an ENTRY probe instance: one that passed
 * sampling and its condition. EXIT probes are handled by {@link addExitProbeRumAction}.
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
  const action = createProbeRumAction(probe)

  try {
    rum.startAction(action.name, {
      // Unique per hit, so an in-flight action can't be stopped by a replacement probe instance
      actionKey: action.snapshotId,
      context: { debugger: buildProbeContext(probe, action) },
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
    ;(globalObject as BrowserWindow).DD_RUM?.stopAction?.(action.name, {
      actionKey: action.snapshotId,
      context: { debugger: buildOutcomeContext(outcome, error) },
    })
  } catch (error) {
    monitorError(error)
  }
}

/**
 * Add a RUM custom action for the first qualifying hit of an EXIT probe instance: one that passed
 * sampling and its condition. The RUM API can't backdate the start of an action once an EXIT
 * condition is known, so for now the action is a point in time at the function exit instead of
 * spanning the call.
 *
 * The probe stays armed when RUM isn't on the page, so a later hit can still create the action.
 *
 * @returns The added action, or undefined if none was added
 */
export function addExitProbeRumAction(
  probe: InitializedProbe,
  outcome: 'return' | 'throw',
  error?: unknown
): ProbeRumAction | undefined {
  if (probe.rumActionStarted || probe.evaluateAt !== 'EXIT') {
    return
  }

  const rum = (globalObject as BrowserWindow).DD_RUM
  if (!rum?.addAction) {
    return
  }

  probe.rumActionStarted = true
  const action = createProbeRumAction(probe)

  try {
    rum.addAction(action.name, {
      debugger: { ...buildProbeContext(probe, action), ...buildOutcomeContext(outcome, error) },
    })
  } catch (error) {
    monitorError(error)
  }

  return action
}

function createProbeRumAction(probe: InitializedProbe): ProbeRumAction {
  return {
    name: `probe: ${probe.where.methodName} (${probe.where.typeName})`,
    snapshotId: generateUUID(),
  }
}

function buildProbeContext(probe: InitializedProbe, action: ProbeRumAction) {
  return {
    probe: {
      id: probe.id,
      version: probe.version,
      location: {
        method: probe.where.methodName,
        type: probe.where.typeName,
      },
    },
    snapshot: { id: action.snapshotId },
  }
}

function buildOutcomeContext(outcome: 'return' | 'throw', error: unknown) {
  const errorType = outcome === 'throw' ? getErrorType(error) : undefined
  return {
    outcome,
    error: errorType === undefined ? undefined : { type: errorType },
  }
}

function getErrorType(error: unknown): string | undefined {
  return isError(error) ? safeReadErrorProperty(error, 'name') : undefined
}
