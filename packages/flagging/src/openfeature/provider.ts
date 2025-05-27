import type {
  Provider,
  EvaluationContext,
  JsonValue,
  Logger,
  Paradigm,
  ProviderMetadata,
  ResolutionDetails,
} from '@openfeature/web-sdk'

import type { Configuration } from '../configuration'
import { evaluate } from '../evaluation'

// We need to use a class here to properly implement the OpenFeature Provider interface
// which requires class methods and properties. This is a valid exception to the no-classes rule.
/* eslint-disable-next-line no-restricted-syntax */
export class DatadogProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'datadog',
  }
  readonly runsOn: Paradigm = 'client'

  private configuration: Configuration = {}

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<boolean> {
    return evaluate(this.configuration, 'boolean', flagKey, defaultValue, context)
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<string> {
    return evaluate(this.configuration, 'string', flagKey, defaultValue, context)
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<number> {
    return evaluate(this.configuration, 'number', flagKey, defaultValue, context)
  }

  resolveObjectEvaluation<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    _logger: Logger
  ): ResolutionDetails<T> {
    // type safety: OpenFeature interface requires us to return a
    // specific T for *any* value of T (which could be any subtype of
    // JsonValue). We can't even theoretically implement it in a
    // type-sound way because there's no runtime information passed to
    // learn what type the user expects. So it's up to the user to
    // makesure they pass the appropriate type.
    return evaluate(this.configuration, 'object', flagKey, defaultValue, context) as ResolutionDetails<T>
  }
}
