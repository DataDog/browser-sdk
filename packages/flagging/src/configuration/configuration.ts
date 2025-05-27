import type { EvaluationContext, FlagValueType, JsonValue, ResolutionDetails } from '@openfeature/web-sdk'

/** @internal */
export type Configuration = {
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
  /** When configuration was generated. */
  createdAt: number
  flags: Record<string, PrecomputedFlag>
}

/** @internal */
export type PrecomputedFlag<T extends FlagValueType = FlagValueType> = {
  type: T
  resolution: ResolutionDetails<FlagTypeToValue<T>>
}
