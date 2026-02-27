/* eslint-disable no-restricted-syntax */
// We need to use a class here to properly implement the OpenFeature Provider interface
// which requires class methods and properties. This is a valid exception to the no-classes rule.
import {
  StandardResolutionReasons,
  type EvaluationContext,
  type JsonValue,
  type Logger,
  type Paradigm,
  type Provider,
  type ResolutionDetails,
} from '@openfeature/web-sdk'
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
    if (!this.precomputeClient || !this.precomputeClient.hasFlag(flagKey)) {
      return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT }
    }
    return {
      value: this.precomputeClient.getBooleanAssignment(flagKey, defaultValue),
      reason: StandardResolutionReasons.STATIC,
    }
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<string> {
    if (!this.precomputeClient || !this.precomputeClient.hasFlag(flagKey)) {
      return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT }
    }
    return {
      value: this.precomputeClient.getStringAssignment(flagKey, defaultValue),
      reason: StandardResolutionReasons.STATIC,
    }
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<number> {
    if (!this.precomputeClient || !this.precomputeClient.hasFlag(flagKey)) {
      return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT }
    }
    return {
      value: this.precomputeClient.getNumericAssignment(flagKey, defaultValue),
      reason: StandardResolutionReasons.STATIC,
    }
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    _context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<T> {
    if (
      !this.precomputeClient ||
      !this.precomputeClient.hasFlag(flagKey) ||
      typeof defaultValue !== 'object' ||
      defaultValue === null
    ) {
      return { value: defaultValue, reason: StandardResolutionReasons.DEFAULT }
    }
    return {
      value: this.precomputeClient.getJSONAssignment(flagKey, defaultValue as object) as T,
      reason: StandardResolutionReasons.STATIC,
    }
  }
}
