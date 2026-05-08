import { HIGH_HASH_UUID, LOW_HASH_UUID } from '../../test'
import { correctedChildSampleRate, isSampled, resetSampleDecisionCache, sampleUsingKnuthFactor } from './sampler'

// UUID chosen arbitrarily, to be used when the test doesn't actually depend on it.
const ARBITRARY_UUID = '1ff81c8c-6e32-473b-869b-55af08048323'

describe('isSampled', () => {
  it('returns true when sampleRate is 100', () => {
    expect(isSampled(ARBITRARY_UUID, 100)).toBeTrue()
  })

  it('returns false when sampleRate is 0', () => {
    expect(isSampled(ARBITRARY_UUID, 0)).toBeFalse()
  })

  it('a session id with a low hash value should be sampled with a rate close to 0%', () => {
    expect(isSampled(LOW_HASH_UUID, 0.1)).toBeTrue()
    resetSampleDecisionCache()
    expect(isSampled(LOW_HASH_UUID, 0.01)).toBeTrue()
    resetSampleDecisionCache()
    expect(isSampled(LOW_HASH_UUID, 0.001)).toBeTrue()
    resetSampleDecisionCache()
    expect(isSampled(LOW_HASH_UUID, 0.0001)).toBeTrue()
    resetSampleDecisionCache()
    // At some point the sample rate is so low that the session is not sampled even if the hash
    // is low. This is not an error: we can probably find a UUID with an even lower hash.
    expect(isSampled(LOW_HASH_UUID, 0.0000000001)).toBeFalse()
  })

  it('a session id with a high hash value should not be sampled even if the rate is close to 100%', () => {
    expect(isSampled(HIGH_HASH_UUID, 99.9)).toBeFalse()
    resetSampleDecisionCache()
    expect(isSampled(HIGH_HASH_UUID, 99.99)).toBeFalse()
    resetSampleDecisionCache()
    expect(isSampled(HIGH_HASH_UUID, 99.999)).toBeFalse()
    resetSampleDecisionCache()
    expect(isSampled(HIGH_HASH_UUID, 99.9999)).toBeFalse()
    resetSampleDecisionCache()
    // At some point the sample rate is so high that the session is sampled even if the hash is
    // high. This is not an error: we can probably find a UUID with an even higher hash.
    expect(isSampled(HIGH_HASH_UUID, 99.9999999999)).toBeTrue()
  })
})

describe('correctedChildSampleRate', () => {
  it('should apply the correction formula', () => {
    expect(correctedChildSampleRate(60, 20)).toBe(12)
  })

  it('should return the child rate unchanged when parent is 100%', () => {
    expect(correctedChildSampleRate(100, 50)).toBe(50)
  })

  it('should return 0 when child rate is 0', () => {
    expect(correctedChildSampleRate(60, 0)).toBe(0)
  })

  it('should return 0 when parent rate is 0', () => {
    expect(correctedChildSampleRate(0, 50)).toBe(0)
  })

  it('should return the parent rate when child rate is 100%', () => {
    expect(correctedChildSampleRate(60, 100)).toBe(60)
  })
})

describe('sampleUsingKnuthFactor', () => {
  it('sampling should be based on the trace id', () => {
    // Generated using the dd-trace-go implementation with the following program: https://go.dev/play/p/CUrDJtze8E_e
    const inputs: Array<[bigint, number, boolean]> = [
      [5577006791947779410n, 94.0509, true],
      [15352856648520921629n, 43.7714, true],
      [3916589616287113937n, 68.6823, true],
      [894385949183117216n, 30.0912, true],
      [12156940908066221323n, 46.889, true],

      [9828766684487745566n, 15.6519, false],
      [4751997750760398084n, 81.364, false],
      [11199607447739267382n, 38.0657, false],
      [6263450610539110790n, 21.8553, false],
      [1874068156324778273n, 36.0871, false],
    ]

    for (const [identifier, sampleRate, expected] of inputs) {
      expect(sampleUsingKnuthFactor(identifier, sampleRate))
        .withContext(`identifier=${identifier}, sampleRate=${sampleRate}`)
        .toBe(expected)
    }
  })

  it('should cache sampling decision per sampling rate', () => {
    // For the same session id, the sampling decision should be different for trace and profiling, eg. trace should not cache profiling decisions and vice versa
    expect(isSampled(HIGH_HASH_UUID, 99.9999999999)).toBeTrue()
    expect(isSampled(HIGH_HASH_UUID, 0.0000001)).toBeFalse()
    expect(isSampled(HIGH_HASH_UUID, 99.9999999999)).toBeTrue()
  })
})
