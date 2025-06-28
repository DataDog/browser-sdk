import type {
  EvaluationContext,
  JsonValue,
  Logger,
  Paradigm,
  Provider,
  ProviderMetadata,
  ResolutionDetails,
  HookContext,
  EvaluationDetails,
  FlagValue,
} from '@openfeature/web-sdk'
/* eslint-disable-next-line local-rules/disallow-side-effects */
import { OpenFeature, ProviderStatus } from '@openfeature/web-sdk'

import { dateNow } from '@datadog/browser-core'
import type { Configuration } from '../configuration'
import { evaluate } from '../evaluation'
import type { DDRum } from './rumIntegration'

export type DatadogProviderOptions = {
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

  /**
   * The site to use for the Datadog API.
   */
  site?: string

  initialConfiguration?: Configuration

  /**
   * RUM integration options
   */
  rum?: {
    /**
     * The RUM SDK instance to use for tracking
     */
    sdk: DDRum
    /**
     * Whether to track feature flag evaluations in RUM
     */
    ddFlaggingTracking?: boolean
    /**
     * Whether to log exposures in RUM
     */
    ddExposureLogging?: boolean
  }
  /**
   * Custom headers to add to the request to the Datadog API.
   */
  customHeaders?: Record<string, string>

  /**
   * Whether to overwrite the default request headers.
   */
  overwriteRequestHeaders?: boolean
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
    const trackFlags = options.rum?.ddFlaggingTracking ?? false
    const logExposures = options.rum?.ddExposureLogging ?? false

    if (options.rum) {
      const rum = options.rum.sdk
      // Add OpenFeature hook
      OpenFeature.addHooks({
        after(_hookContext: HookContext, details: EvaluationDetails<FlagValue>) {
          if (trackFlags) {
            // Track feature flag evaluation
            rum.addFeatureFlagEvaluation(details.flagKey, details.value)
          }
          if (logExposures) {
            // Log exposure
            rum.addAction('__dd_exposure', {
              timestamp: dateNow(),
              flag_key: details.flagKey,
              allocation_key: (details.flagMetadata?.allocationKey as string) ?? '',
              exposure_key: `${details.flagKey}-${details.flagMetadata?.allocationKey}`,
              subject_key: _hookContext.context.targetingKey,
              subject_attributes: _hookContext.context,
              variant_key: details.variant,
            })
          }
        },
      })
    }

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
  const baseUrl = options.site || 'https://dd.datad0g.com'

  // Stringify all context values
  const stringifiedContext: Record<string, string> = {}
  for (const [key, value] of Object.entries(context)) {
    stringifiedContext[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }

  const response = await fetch(`${baseUrl}/api/unstable/precompute-assignments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.api+json',
      ...(!options.overwriteRequestHeaders ?
        {
          'dd-client-token': options.clientToken,
          'dd-application-id': options.applicationId
        } : {}),
      ...options.customHeaders,
    },
    body: JSON.stringify({
      data: {
        type: 'precompute-assignments-request',
        attributes: {
          env: {
            name: options.env,
          },
          subject: {
            targeting_key: context.targetingKey || '',
            targeting_attributes: stringifiedContext,
          },
        },
      },
    }),
  })
  const precomputed = await response.json()
  return {
    precomputed: {
      response: precomputed,
      context,
      fetchedAt: Date.now(),
    },
  }
}
