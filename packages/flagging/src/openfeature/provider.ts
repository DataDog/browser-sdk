import type {
  EvaluationContext,
  JsonValue,
  Logger,
  Paradigm,
  Provider,
  ProviderMetadata,
  ResolutionDetails,
} from '@openfeature/web-sdk'
/* eslint-disable-next-line local-rules/disallow-side-effects */
import { ProviderStatus } from '@openfeature/web-sdk'

import type { Configuration } from '../configuration'
import { evaluate } from '../evaluation'

export type DatadogProviderOptions = {
  /**
   * The API key for Datadog. Required for authenticating your application with Datadog.
   */
  apiKey: string
  /**
   * The application key for Datadog. Required for authenticating your application with Datadog.
   */
  applicationKey: string

  /**
   * The application key for Datadog. Required for initializing the Datadog RUM client.
   */
  applicationId: string

  /**
   * The client token for Datadog. Required for initializing the Datadog RUM client.
   */
  clientToken: string

  /**
   * The environment for Datadog.
   */
  env: string

  baseUrl?: string

  initialConfiguration?: Configuration
}

// We need to use a class here to properly implement the OpenFeature Provider interface
// which requires class methods and properties. This is a valid exception to the no-classes rule.
/* eslint-disable-next-line no-restricted-syntax */
export class DatadogProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'datadog',
  }
  readonly runsOn: Paradigm = 'client'

  status: ProviderStatus
  private configuration: Configuration = {}

  private options: DatadogProviderOptions

  constructor(options: DatadogProviderOptions) {
    this.options = options

    if (options.initialConfiguration) {
      this.configuration = options.initialConfiguration
      this.status = ProviderStatus.READY
    } else {
      this.configuration = {}
      this.status = ProviderStatus.NOT_READY
    }
  }

  async initialize(context: EvaluationContext = {}): Promise<void> {
    this.configuration = await fetchConfiguration(this.options, context)
    this.status = ProviderStatus.READY
  }

  async onContextChange(_oldContext: EvaluationContext, context: EvaluationContext): Promise<void> {
    this.status = ProviderStatus.RECONCILING
    this.configuration = await fetchConfiguration(this.options, context)
    this.status = ProviderStatus.READY
  }

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

async function fetchConfiguration(options: DatadogProviderOptions, context: EvaluationContext): Promise<Configuration> {
  const baseUrl = options.baseUrl || 'https://dd.datad0g.com'

  const response = await fetch(`${baseUrl}/api/unstable/precompute-assignments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'dd-api-key': options.apiKey,
      'dd-application-key': options.applicationKey,
    },
    body: JSON.stringify({
      context,
    }),
  })
  const precomputed = await response.json()
  return { precomputed }
}
