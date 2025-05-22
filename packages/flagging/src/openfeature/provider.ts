/* eslint-disable local-rules/disallow-side-effects */
/* eslint-disable no-restricted-syntax */
// We need to use a class here to properly implement the OpenFeature Provider interface
// which requires class methods and properties. This is a valid exception to the no-classes rule.
import type { EvaluationContext, JsonValue, Logger, Paradigm, ResolutionDetails } from '@openfeature/core'
import { StandardResolutionReasons } from '@openfeature/core'
import type { Provider } from '@openfeature/web-sdk'
import type { PrecomputeClient } from '../precomputeClient'

export class DatadogProvider implements Provider {
  runsOn: Paradigm = 'client'
  metadata = {
    name: 'datadog',
  } as const

  private precomputeClient: PrecomputeClient | undefined

  constructor(precomputeClient?: PrecomputeClient) {
    this.precomputeClient = precomputeClient
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<boolean> {
    return {
      value: this.precomputeClient?.getBooleanAssignment(flagKey, defaultValue) ?? defaultValue,
      reason: StandardResolutionReasons.DEFAULT,
    }
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<string> {
    return {
      value: this.precomputeClient?.getStringAssignment(flagKey, defaultValue) ?? defaultValue,
      reason: StandardResolutionReasons.DEFAULT,
    }
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<number> {
    return {
      value: this.precomputeClient?.getNumericAssignment(flagKey, defaultValue) ?? defaultValue,
      reason: StandardResolutionReasons.DEFAULT,
    }
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<T> {
    const value =
      typeof defaultValue === 'object' && defaultValue !== null && this.precomputeClient
        ? (this.precomputeClient.getJSONAssignment(flagKey, defaultValue as object) as T)
        : defaultValue

    return {
      value,
      reason: StandardResolutionReasons.DEFAULT,
    }
  }
}
