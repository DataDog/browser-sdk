/* eslint-disable local-rules/disallow-side-effects */
/* eslint-disable no-restricted-syntax */
// We need to use a class here to properly implement the OpenFeature Provider interface
// which requires class methods and properties. This is a valid exception to the no-classes rule.
import type { EvaluationContext, JsonValue, Logger, Paradigm, ResolutionDetails } from '@openfeature/core'
import { StandardResolutionReasons } from '@openfeature/core'
import type { Provider } from '@openfeature/web-sdk'

export class DatadogProvider implements Provider {
  runsOn: Paradigm = 'client'
  metadata = {
    name: 'datadog',
  } as const

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
  }

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
  }

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
  }

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
  }
}
