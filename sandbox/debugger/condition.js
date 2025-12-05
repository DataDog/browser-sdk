/**
 * Evaluate probe condition to determine if probe should fire
 * @param {Object} probe - Probe configuration
 * @param {Object} context - Runtime context with variables
 * @returns {boolean} - True if condition passes (or no condition), false otherwise
 */
export function evaluateProbeCondition (probe, context) {
  // If no condition, probe always fires
  if (!probe.condition) {
    return true
  }

  try {
    // Extract context variables
    const contextKeys = Object.keys(context)
    const contextValues = contextKeys.map(key => context[key])

    // Create and execute condition function
    const fn = new Function(...contextKeys, `return ${probe.condition}`)
    return Boolean(fn(...contextValues))
  } catch (e) {
    // If condition evaluation fails, log error and let probe fire
    console.error(`Failed to evaluate condition for probe ${probe.id}:`, e)
    return true
  }
}
