import { ExperimentalFeature, isExperimentalFeatureEnabled, performDraw } from '@datadog/browser-core'

let sampleDecisionCache: { sessionId: string; sampleRate: number; decision: boolean } | undefined

export function isTraceSampled(sessionId: string, sampleRate: number) {
  // Shortcuts for common cases. This is not strictly necessary, but it makes the code faster for
  // customers willing to ingest all traces.
  if (sampleRate === 100) {
    return true
  }

  if (sampleRate === 0) {
    return false
  }

  if (!isExperimentalFeatureEnabled(ExperimentalFeature.CONSISTENT_TRACE_SAMPLING)) {
    return performDraw(sampleRate)
  }

  if (
    sampleDecisionCache &&
    sessionId === sampleDecisionCache.sessionId &&
    sampleRate === sampleDecisionCache.sampleRate
  ) {
    return sampleDecisionCache.decision
  }

  let decision: boolean
  // @ts-expect-error BigInt might not be defined in every browser we support
  if (window.BigInt) {
    decision = sampleUsingKnuthFactor(BigInt(`0x${sessionId.split('-')[4]}`), sampleRate)
  } else {
    // For simplicity, we don't use consistent sampling for browser without BigInt support
    // TODO: remove this when all browser we support have BigInt support
    decision = performDraw(sampleRate)
  }
  sampleDecisionCache = { sessionId, sampleRate, decision }
  return decision
}

// Exported for tests
export function resetSampleDecisionCache() {
  sampleDecisionCache = undefined
}

/**
 * Perform sampling using the Knuth factor method. This method offer consistent sampling result
 * based on the provided identifier.
 *
 * @param identifier The identifier to use for sampling.
 * @param sampleRate The sample rate in percentage between 0 and 100.
 */
export function sampleUsingKnuthFactor(identifier: bigint, sampleRate: number) {
  // The formula is:
  //
  //   (identifier * knuthFactor) % 2^64 < sampleRate * 2^64
  //
  // Because JavaScript numbers are 64-bit floats, we can't represent 64-bit integers, and the
  // modulo would be incorrect. Thus, we are using BigInts here.
  //
  // Implementation in other languages:
  // * Go     https://github.com/DataDog/dd-trace-go/blob/ec6fbb1f2d517b7b8e69961052adf7136f3af773/ddtrace/tracer/sampler.go#L86-L91
  // * Python https://github.com/DataDog/dd-trace-py/blob/0cee2f066fb6e79aa15947c1514c0f406dea47c5/ddtrace/sampling_rule.py#L197
  // * Ruby   https://github.com/DataDog/dd-trace-rb/blob/1a6e255cdcb7e7e22235ea5955f90f6dfa91045d/lib/datadog/tracing/sampling/rate_sampler.rb#L42
  // * C++    https://github.com/DataDog/dd-trace-cpp/blob/159629edc438ae45f2bb318eb7bd51abd05e94b5/src/datadog/trace_sampler.cpp#L58
  // * Java   https://github.com/DataDog/dd-trace-java/blob/896dd6b380533216e0bdee59614606c8272d313e/dd-trace-core/src/main/java/datadog/trace/common/sampling/DeterministicSampler.java#L48
  //
  // Note: All implementations have slight variations. Some of them use '<=' instead of '<', and
  // use `sampleRate * 2^64 - 1` instead of `sampleRate * 2^64`. The following implementation
  // should adhere to the spec and is a bit simpler than using a 2^64-1 limit as there are less
  // BigInt arithmetic to write. In practice this does not matter, as we are using floating point
  // numbers in the end, and Number(2n**64n-1n) === Number(2n**64n).
  const knuthFactor = BigInt('1111111111111111111')
  const twoPow64 = BigInt('0x10000000000000000') // 2n ** 64n
  const hash = (identifier * knuthFactor) % twoPow64
  return Number(hash) <= (sampleRate / 100) * Number(twoPow64)
}
