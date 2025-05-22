/* eslint-disable local-rules/disallow-side-effects */
import type { EvaluationContext, JsonValue, Logger, ResolutionDetails } from '@openfeature/core'
import { StandardResolutionReasons } from '@openfeature/core'
import type { Provider } from '@openfeature/web-sdk'

export function createDatadogProvider(): Provider {
  return {
    runsOn: 'client',
    metadata: {
      name: 'datadog',
    } as const,

    resolveBooleanEvaluation(
      _flagKey: string,
      defaultValue: boolean,
      _context: EvaluationContext,
      _logger: Logger
    ): ResolutionDetails<boolean> {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
      }
    },

    resolveStringEvaluation(
      _flagKey: string,
      defaultValue: string,
      _context: EvaluationContext,
      _logger: Logger
    ): ResolutionDetails<string> {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
      }
    },

    resolveNumberEvaluation(
      _flagKey: string,
      defaultValue: number,
      _context: EvaluationContext,
      _logger: Logger
    ): ResolutionDetails<number> {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
      }
    },

    resolveObjectEvaluation<T extends JsonValue>(
      _flagKey: string,
      defaultValue: T,
      _context: EvaluationContext,
      _logger: Logger
    ): ResolutionDetails<T> {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
      }
    },
  }
}
