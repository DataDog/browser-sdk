import { display } from '@datadog/browser-core'
export interface ProbeWithCondition {
  id: string
  condition?: string
}

/**
 * Evaluate probe condition to determine if probe should fire
 *
 * @param probe - Probe configuration
 * @param context - Runtime context with variables
 * @returns True if condition passes (or no condition), false otherwise
 */
export function evaluateProbeCondition(probe: ProbeWithCondition, context: Record<string, any>): boolean {
  // If no condition, probe always fires
  if (!probe.condition) {
    return true
  }

  try {
    // Separate 'this' from other context variables
    const { this: thisValue, ...otherContext } = context
    const contextKeys = Object.keys(otherContext)
    const contextValues = Object.values(otherContext)

    // Create function and execute with proper 'this' binding
    // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
    const fn = new Function(...contextKeys, `return ${probe.condition}`)
    return Boolean(fn.call(thisValue, ...contextValues))
  } catch (e) {
    // If condition evaluation fails, log error and let probe fire
    // TODO: Handle error properly
    display.error(`Failed to evaluate condition for probe ${probe.id}:`, e)
    return true
  }
}
