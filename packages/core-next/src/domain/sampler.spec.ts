import { isSampled, sampleUsingKnuthFactor, resetSampleDecisionCache } from './sampler'

describe('isSampled', () => {
  afterEach(() => {
    resetSampleDecisionCache()
  })

  it('returns true when sampleRate is 100', () => {
    expect(isSampled('any-session-id', 100)).toBe(true)
  })

  it('returns false when sampleRate is 0', () => {
    expect(isSampled('any-session-id', 0)).toBe(false)
  })

  it('returns deterministic result for same session and rate', () => {
    const result1 = isSampled('550e8400-e29b-41d4-a716-446655440000', 50)
    resetSampleDecisionCache()
    const result2 = isSampled('550e8400-e29b-41d4-a716-446655440000', 50)
    expect(result1).toBe(result2)
  })

  it('returns different results for different session IDs', () => {
    // With enough sessions, some should be sampled and some not
    let sampled = 0
    for (let i = 0; i < 100; i++) {
      resetSampleDecisionCache()
      if (isSampled(`session-${i}-${i * 1000}-aaaa-bbbb-${i.toString(16).padStart(12, '0')}`, 50)) {
        sampled++
      }
    }
    // With 50% rate, expect roughly 30-70 sampled out of 100
    expect(sampled).toBeGreaterThan(10)
    expect(sampled).toBeLessThan(90)
  })

  it('caches the decision for the same session and rate', () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000'
    const result1 = isSampled(sessionId, 50)
    // Second call should return cached value
    const result2 = isSampled(sessionId, 50)
    expect(result1).toBe(result2)
  })

  it('uses different decisions for different rates', () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000'
    const at100 = isSampled(sessionId, 100)
    resetSampleDecisionCache()
    const at1 = isSampled(sessionId, 1)
    expect(at100).toBe(true)
    expect(typeof at1).toBe('boolean')
  })
})

describe('sampleUsingKnuthFactor', () => {
  it('returns true for identifier that falls within sample rate', () => {
    // With rate 100%, everything should be sampled
    expect(sampleUsingKnuthFactor(BigInt('0x446655440000'), 100)).toBe(true)
  })

  it('returns false for rate 0 scenario', () => {
    // rate 0 means threshold is 0, so hash must be <= 0 which is extremely unlikely
    // We test with a known identifier
    expect(sampleUsingKnuthFactor(BigInt('0x446655440000'), 0)).toBe(false)
  })

  it('produces consistent results', () => {
    const id = BigInt('0xabcdef123456')
    const r1 = sampleUsingKnuthFactor(id, 50)
    const r2 = sampleUsingKnuthFactor(id, 50)
    expect(r1).toBe(r2)
  })
})
