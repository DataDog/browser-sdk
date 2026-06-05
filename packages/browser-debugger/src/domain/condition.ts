export interface CompiledCondition {
  evaluate: (contextKeys: string[]) => (...args: any[]) => boolean
}

export interface ProbeWithCondition {
  id: string
  when?: {
    dsl: string
  }
  condition?: CompiledCondition
}

export interface EvaluationError {
  [key: string]: string
  expr: string
  message: string
}

export type ConditionEvaluationError = Error & { evaluationError: EvaluationError }

export function createConditionEvaluationError(evaluationError: EvaluationError): ConditionEvaluationError {
  const error = new Error(evaluationError.message) as ConditionEvaluationError
  error.name = 'ConditionEvaluationError'
  error.evaluationError = evaluationError
  return error
}

export function isConditionEvaluationError(error: unknown): error is ConditionEvaluationError {
  return error instanceof Error && error.name === 'ConditionEvaluationError' && 'evaluationError' in error
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
  }
}

/**
 * Evaluate probe condition to determine if probe should fire
 *
 * @param probe - Probe configuration
 * @param context - Runtime context with variables
 * @returns True if condition passes (or no condition), false otherwise
 * @throws ConditionEvaluationError when the condition cannot be evaluated
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
    throw createConditionEvaluationError({
      expr: probe.when!.dsl,
      message: formatConditionEvaluationError(e),
    })
  }
}

function formatConditionEvaluationError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
