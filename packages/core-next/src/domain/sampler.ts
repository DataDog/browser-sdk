const sampleDecisionCache = new Map<number, { sessionId: string; decision: boolean }>()

/**
 * Deterministic sampling using the Knuth multiplicative hash.
 * Same session ID + same sample rate always produces the same decision.
 *
 * Uses the last segment of the session ID (UUID format) as the identifier,
 * matching the algorithm used across all Datadog SDKs (Go, Python, Ruby, Java, C++).
 */
function isSampled(sessionId: string, sampleRate: number): boolean {
  if (sampleRate === 100) return true
  if (sampleRate === 0) return false

  const cached = sampleDecisionCache.get(sampleRate)
  if (cached && cached.sessionId === sessionId) {
    return cached.decision
  }

  let decision: boolean

  if (typeof BigInt !== 'undefined') {
    const lastSegment = sessionId.split('-').pop() || sessionId
    const identifier = BigInt(`0x${lastSegment}`)
    decision = sampleUsingKnuthFactor(identifier, sampleRate)
  } else {
    // Fallback for environments without BigInt: simple hash
    decision = fallbackSample(sessionId, sampleRate)
  }

  sampleDecisionCache.set(sampleRate, { sessionId, decision })
  return decision
}

function sampleUsingKnuthFactor(identifier: bigint, sampleRate: number): boolean {
  const knuthFactor = BigInt('1111111111111111111')
  const twoPow64 = BigInt('0x10000000000000000')
  const hash = (identifier * knuthFactor) % twoPow64
  return Number(hash) <= (sampleRate / 100) * Number(twoPow64)
}

function fallbackSample(sessionId: string, sampleRate: number): boolean {
  let hash = 0
  for (let i = 0; i < sessionId.length; i++) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) | 0
  }
  return Math.abs(hash % 100) < sampleRate
}

function resetSampleDecisionCache(): void {
  sampleDecisionCache.clear()
}

export { isSampled, sampleUsingKnuthFactor, resetSampleDecisionCache }
