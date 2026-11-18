import { isError, safeToString } from '@datadog/browser-core'
import { formatUnknownError } from './error'
import type { CompiledExpression } from './expression'

export interface ProbeWithCondition {
  id: string
  when?: {
    dsl: string
  }
  condition?: CompiledExpression
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
    return Boolean(probe.condition(context))
  } catch (e) {
    throw createConditionEvaluationError({
      expr: probe.when!.dsl,
      message: formatConditionEvaluationError(e),
    })
  }
}

function formatConditionEvaluationError(error: unknown): string {
  return isError(error) ? formatUnknownError(error) : (safeToString(error) ?? '<error: unable to stringify error>')
}
