import type { ErrorCode, EvaluationContext, FlagValueType, ResolutionDetails } from '@openfeature/web-sdk'

import type { Configuration, FlagTypeToValue, PrecomputedConfiguration } from './configuration'

export function evaluate<T extends FlagValueType>(
  configuration: Configuration,
  type: T,
  flagKey: string,
  defaultValue: FlagTypeToValue<T>,
  context: EvaluationContext
): ResolutionDetails<FlagTypeToValue<T>> {
  if (configuration.precomputed) {
    return evaluatePrecomputed(configuration.precomputed, type, flagKey, defaultValue, context)
  }

  return {
    value: defaultValue,
    reason: 'DEFAULT',
  }
}

function evaluatePrecomputed<T extends FlagValueType>(
  precomputed: PrecomputedConfiguration,
  type: T,
  flagKey: string,
  defaultValue: FlagTypeToValue<T>,
  _context: EvaluationContext
): ResolutionDetails<FlagTypeToValue<T>> {
  const flag = precomputed.response.data.attributes.flags[flagKey]
  if (!flag) {
    return {
      value: defaultValue,
      reason: 'ERROR',
      errorCode: 'FLAG_NOT_FOUND' as ErrorCode,
    }
  }

  if (flag.variationType && flag.variationType.toLowerCase() !== type.toLowerCase()) {
    return {
      value: defaultValue,
      reason: 'ERROR',
      errorCode: 'TYPE_MISMATCH' as ErrorCode,
    }
  }

  return {
    value: flag.variationValue as FlagTypeToValue<T>,
    variant: flag.variationKey,
    flagMetadata: {
      allocationKey: flag.allocationKey,
      variationType: flag.variationType,
      doLog: flag.doLog,
    },
    reason: flag.reason,
  } as ResolutionDetails<FlagTypeToValue<T>>
}
