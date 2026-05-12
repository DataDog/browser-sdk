import { display } from '@datadog/browser-core'

export interface CompiledCondition {
  evaluate: (contextKeys: string[]) => (...args: any[]) => boolean
  clearCache: () => void
}

export interface ProbeWithCondition {
  id: string
  condition?: CompiledCondition
}

/**
 * Pre-compile a condition expression into a cached function factory.
 *
 * The returned `evaluate` method accepts the runtime context keys (e.g. `['x', 'y']`) and
 * returns a Function whose parameters match those keys. Context values are passed positionally
 * at call time via `fn.call(thisValue, ...contextValues)`.
 *
 * Because `new Function()` is expensive (it parses and compiles JS source), we cache the
 * resulting Function objects keyed by context keys. For ENTRY probes there is always exactly one
 * cache entry. For EXIT probes there can be two — one for the normal-return path and one for the
 * exception path — since they provide different context variables.
 */
export function compileCondition(condition: string): CompiledCondition {
  const fnBody = `return ${condition}`
  const functionCache = new Map<string, (...args: any[]) => boolean>()

  return {
    evaluate: (contextKeys: string[]) => {
      const cacheKey = contextKeys.join(',')
      let fn = functionCache.get(cacheKey)
      if (!fn) {
        // eslint-disable-next-line no-new-func, @typescript-eslint/no-implied-eval
        fn = new Function(...contextKeys, fnBody) as (...args: any[]) => boolean
        functionCache.set(cacheKey, fn)
      }
      return fn
    },
    clearCache: () => {
      functionCache.clear()
    },
  }
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

    const fn = probe.condition.evaluate(contextKeys)
    return Boolean(fn.call(thisValue, ...contextValues))
  } catch (e) {
    // If condition evaluation fails, log error and let probe fire
    // TODO: Handle error properly
    display.error(`Failed to evaluate condition for probe ${probe.id}:`, e)
    return true
  }
}
