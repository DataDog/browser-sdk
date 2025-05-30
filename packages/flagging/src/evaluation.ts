import type { ErrorCode, EvaluationContext, FlagValueType, ResolutionDetails } from '@openfeature/web-sdk'

import type { Configuration, PrecomputedConfiguration, FlagTypeToValue } from './configuration'

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

  if (flag.type !== type) {
    return {
      value: defaultValue,
      reason: 'ERROR',
      errorCode: 'TYPE_MISMATCH' as ErrorCode,
    }
  }

  return flag.resolution as ResolutionDetails<FlagTypeToValue<T>>
}
