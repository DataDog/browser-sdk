import { ExperimentalFeature } from '@datadog/browser-core'
import { mockExperimentalFeatures } from '../../../../core/test'
import { isTraceSampled, resetSampleDecisionCache, sampleUsingKnuthFactor } from './sampler'

// UUID known to yield a low hash value using the Knuth formula, making it more likely to be sampled
const LOW_HASH_UUID = '29a4b5e3-9859-4290-99fa-4bc4a1a348b9'
// UUID known to yield a high hash value using the Knuth formula, making it less likely to be
// sampled
const HIGH_HASH_UUID = '5321b54a-d6ec-4b24-996d-dd70c617e09a'

// UUID chosen arbitrarily, to be used when the test doesn't actually depend on it.
const ARBITRARY_UUID = '1ff81c8c-6e32-473b-869b-55af08048323'

describe('isTraceSampled', () => {
  beforeEach(() => {
    resetSampleDecisionCache()
  })

  describe('with CONSISTENT_TRACE_SAMPLING enabled', () => {
    beforeEach(() => {
      mockExperimentalFeatures([ExperimentalFeature.CONSISTENT_TRACE_SAMPLING])
    })

    it('returns true when sampleRate is 100', () => {
      expect(isTraceSampled(ARBITRARY_UUID, 100)).toBeTrue()
    })

    it('returns false when sampleRate is 0', () => {
      expect(isTraceSampled(ARBITRARY_UUID, 0)).toBeFalse()
    })

    describe('with bigint support', () => {
      beforeEach(() => {
        if (!window.BigInt) {
          pending('BigInt is not supported')
        }
      })

      it('a session id with a low hash value should be sampled with a rate close to 0%', () => {
        expect(isTraceSampled(LOW_HASH_UUID, 0.1)).toBeTrue()
        resetSampleDecisionCache()
        expect(isTraceSampled(LOW_HASH_UUID, 0.01)).toBeTrue()
        resetSampleDecisionCache()
        expect(isTraceSampled(LOW_HASH_UUID, 0.001)).toBeTrue()
        resetSampleDecisionCache()
        expect(isTraceSampled(LOW_HASH_UUID, 0.0001)).toBeTrue()
        resetSampleDecisionCache()
        // At some point the sample rate is so low that the session is not sampled even if the hash
        // is low. This is not an error: we can probably find a UUID with an even lower hash.
        expect(isTraceSampled(LOW_HASH_UUID, 0.0000000001)).toBeFalse()
      })

      it('a session id with a high hash value should not be sampled even if the rate is close to 100%', () => {
        expect(isTraceSampled(HIGH_HASH_UUID, 99.9)).toBeFalse()
        resetSampleDecisionCache()
        expect(isTraceSampled(HIGH_HASH_UUID, 99.99)).toBeFalse()
        resetSampleDecisionCache()
        expect(isTraceSampled(HIGH_HASH_UUID, 99.999)).toBeFalse()
        resetSampleDecisionCache()
        expect(isTraceSampled(HIGH_HASH_UUID, 99.9999)).toBeFalse()
        resetSampleDecisionCache()
        // At some point the sample rate is so high that the session is sampled even if the hash is
        // high. This is not an error: we can probably find a UUID with an even higher hash.
        expect(isTraceSampled(HIGH_HASH_UUID, 99.9999999999)).toBeTrue()
      })
    })

    describe('without bigint support', () => {
      beforeEach(() => {
        // @ts-expect-error BigInt might not be defined depending on the browser where we execute
        // the tests
        if (window.BigInt) {
          pending('BigInt is supported')
        }
      })

      it('sampling decision should be cached', () => {
        spyOn(Math, 'random').and.returnValues(0.2, 0.8)
        expect(isTraceSampled(ARBITRARY_UUID, 50)).toBeTrue()
        expect(isTraceSampled(ARBITRARY_UUID, 50)).toBeTrue()
      })
    })
  })

  describe('without CONSISTENT_TRACE_SAMPLING enabled', () => {
    it('sampling should be random', () => {
      spyOn(Math, 'random').and.returnValues(0.2, 0.8, 0.2, 0.8, 0.2)
      expect(isTraceSampled(ARBITRARY_UUID, 50)).toBeTrue()
      expect(isTraceSampled(ARBITRARY_UUID, 50)).toBeFalse()
      expect(isTraceSampled(ARBITRARY_UUID, 50)).toBeTrue()
      expect(isTraceSampled(ARBITRARY_UUID, 50)).toBeFalse()
      expect(isTraceSampled(ARBITRARY_UUID, 50)).toBeTrue()
    })
  })
})

describe('sampleUsingKnuthFactor', () => {
  beforeEach(() => {
    if (!window.BigInt) {
      pending('BigInt is not supported')
    }
  })

  it('sampling should be based on the trace id', () => {
    // Generated using the dd-trace-go implementation with the following program: https://go.dev/play/p/CUrDJtze8E_e
    const inputs: Array<[bigint, number, boolean]> = [
      [BigInt('5577006791947779410'), 94.0509, true],
      [BigInt('15352856648520921629'), 43.7714, true],
      [BigInt('3916589616287113937'), 68.6823, true],
      [BigInt('894385949183117216'), 30.0912, true],
      [BigInt('12156940908066221323'), 46.889, true],

      [BigInt('9828766684487745566'), 15.6519, false],
      [BigInt('4751997750760398084'), 81.364, false],
      [BigInt('11199607447739267382'), 38.0657, false],
      [BigInt('6263450610539110790'), 21.8553, false],
      [BigInt('1874068156324778273'), 36.0871, false],
    ]

    for (const [identifier, sampleRate, expected] of inputs) {
      expect(sampleUsingKnuthFactor(identifier, sampleRate))
        .withContext(`identifier=${identifier}, sampleRate=${sampleRate}`)
        .toBe(expected)
    }
  })
})
