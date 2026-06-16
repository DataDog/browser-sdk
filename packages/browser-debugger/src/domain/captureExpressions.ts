import { capture } from './capture'
import type { CapturedValue, CaptureContext } from './capture'
import type { EvaluationError } from './condition'
import type { InitializedProbe } from './probes'

export interface CaptureExpressionsResult {
  values?: Record<string, CapturedValue>
  evaluationErrors?: EvaluationError[]
}

export function evaluateCaptureExpressions(
  probe: InitializedProbe,
  context: Record<string, any>,
  captureCtx: CaptureContext
): CaptureExpressionsResult | undefined {
  const compiledCaptureExpressions = probe.compiledCaptureExpressions
  if (!compiledCaptureExpressions) {
    return
  }

  const values: Record<string, CapturedValue> = {}
  const evaluationErrors: EvaluationError[] = []

  for (const { name, expression, capture: captureOptions } of compiledCaptureExpressions.expressions) {
    try {
      const value = compiledCaptureExpressions.evaluateExpression(expression, context)
      values[name] = capture(value, captureOptions, captureCtx)
    } catch (error) {
      evaluationErrors.push({
        expr: name,
        message: formatCaptureExpressionEvaluationError(error),
      })
    }
  }

  return {
    values: Object.keys(values).length ? values : undefined,
    evaluationErrors: evaluationErrors.length ? evaluationErrors : undefined,
  }
}

function formatCaptureExpressionEvaluationError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
