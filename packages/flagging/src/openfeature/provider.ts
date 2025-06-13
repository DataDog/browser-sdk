import type {
  Provider,
  EvaluationContext,
  JsonValue,
  Logger,
  Paradigm,
  ProviderMetadata,
  ResolutionDetails,
  HookContext,
  EvaluationDetails,
  FlagValue,
} from '@openfeature/web-sdk'
/* eslint-disable-next-line local-rules/disallow-side-effects */
import { OpenFeature, ProviderStatus } from '@openfeature/web-sdk'

import type { Configuration } from '../configuration'
import { evaluate } from '../evaluation'
import { DDRum, newDatadogRumIntegration } from './rum-integration'

export type DatadogProviderOptions = {
  /**
   * The RUM application ID.
   */
  applicationId: string
  /**
   * The client token for Datadog. Required for authenticating your application with Datadog.
   */
  clientToken: string

  /**
   * The site to use for the Datadog API.
   */
  site?: string

  initialConfiguration?: Configuration

  // RUM-related options
  datadogRum?: {
    /**
     * Whether to use the Flagging Tracking feature of the RUM 
     */
    ddFlaggingTracking?: boolean

    /**
     * Whether to log exposures to RUM
     */
    ddExposureLogging?: boolean

    /**
     * Object satisfying the minimum required interface for the RUM SDK. Default is the global datadogRum object from `@datadog/browser-rum`.
     */
    datadogRum: DDRum
  }
}

// We need to use a class here to properly implement the OpenFeature Provider interface
// which requires class methods and properties. This is a valid exception to the no-classes rule.
/* eslint-disable-next-line no-restricted-syntax */
export class DatadogProvider implements Provider {
  private readonly dd_flagging_tracking: boolean
  private readonly dd_exposure_logging: boolean
  private evaluationContext: EvaluationContext = {}

  readonly metadata: ProviderMetadata = {
    name: 'datadog',
  }
  readonly runsOn: Paradigm = 'client'

  status: ProviderStatus
  private configuration: Configuration = {}

  private options: DatadogProviderOptions

  constructor(options: DatadogProviderOptions) {
    this.options = options
    this.dd_flagging_tracking = options.datadogRum?.ddFlaggingTracking ?? false
    this.dd_exposure_logging = options.datadogRum?.ddExposureLogging ?? false

    if (options.datadogRum) {
      // Integrate with the RUM SDK
      const rumIntegration = newDatadogRumIntegration(options.datadogRum.datadogRum)

      const flaggingProvider = this;

      // Add OpenFeature hook
      OpenFeature.addHooks({
        after(_hookContext: HookContext, details: EvaluationDetails<FlagValue>) {
          if (flaggingProvider.dd_flagging_tracking) {
            // Integrate with existing RUM flagging tracking
            rumIntegration.trackFeatureFlag(details.flagKey, details.value)
          }
          if (flaggingProvider.dd_exposure_logging) {
            rumIntegration.trackExposure({
              flagKey: details.flagKey,
              allocationKey: details.flagMetadata?.allocationKey as string ?? '',
              exposureKey: `${details.flagKey}-${details.flagMetadata?.allocationKey}`,
              subjectKey: _hookContext.context.targetingKey,
              subjectAttributes: flaggingProvider.evaluationContext,
              variantKey: details.variant,
            })
          }
        }
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

  const parameters = [`application_id=${options.applicationId}`, `client_token=${options.clientToken}`]

  const response = await fetch(`${baseUrl}/api/unstable/precompute-assignments?${parameters.join('&')}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'DD-API-KEY': options.clientToken,
    },
    body: JSON.stringify({
      context,
    }),
  })
  const precomputed = await response.json()
  return { precomputed }
}
