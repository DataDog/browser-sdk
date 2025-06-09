import type { EvaluationContext, FlagValueType, JsonValue, ResolutionReason } from '@openfeature/web-sdk'
/**
 * Internal configuration for DatadogProvider.
 */
export type Configuration = {
  /** @internal */
  precomputed?: PrecomputedConfiguration
}

/** @internal */
export type PrecomputedConfiguration = {
  response: PrecomputedConfigurationResponse
  context?: EvaluationContext
  fetchedAt?: UnixTimestamp
}

// Fancy way to map FlagValueType to expected FlagValue.
/** @internal */
export type FlagTypeToValue<T extends FlagValueType> = {
  ['boolean']: boolean
  ['string']: string
  ['number']: number
  ['object']: JsonValue
}[T]

/** @internal
 * Timestamp in milliseconds since Unix Epoch.
 */
export type UnixTimestamp = number

/** @internal */
export type PrecomputedConfigurationResponse = {
  data: {
    attributes: {
      /** When configuration was generated. */
      createdAt: number
      flags: Record<string, PrecomputedFlag>
    }
  }
}

/** @internal */
export type PrecomputedFlag<T extends FlagValueType = FlagValueType> = {
  allocationKey: string
  variationKey: string
  variationType: T
  variationValue: FlagTypeToValue<T>
  reason: ResolutionReason
  doLog: boolean
  extraLogging: Record<string, unknown>
}
