import type { TraceIdentifier } from './identifier'
import { isTraceSampled } from './sampler'

describe('isTraceSampled', () => {
  describe('with bigint support', () => {
    beforeEach(() => {
      if (!window.BigInt) {
        pending('BigInt is not supported')
      }
    })

    it('returns true when sampleRate is 100', () => {
      expect(isTraceSampled(BigInt('1234') as unknown as TraceIdentifier, 100)).toBeTrue()
    })

    it('returns false when sampleRate is 0', () => {
      expect(isTraceSampled(BigInt('1234') as unknown as TraceIdentifier, 0)).toBeFalse()
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
        expect(isTraceSampled(identifier as unknown as TraceIdentifier, sampleRate))
          .withContext(`identifier=${identifier}, sampleRate=${sampleRate}`)
          .toBe(expected)
      }
    })
  })

  describe('without bigint support', () => {
    it('returns true when sampleRate is 100', () => {
      expect(isTraceSampled({} as TraceIdentifier, 100)).toBeTrue()
    })

    it('returns false when sampleRate is 0', () => {
      expect(isTraceSampled({} as TraceIdentifier, 0)).toBeFalse()
    })

    it('sampling should be random', () => {
      spyOn(Math, 'random').and.returnValues(0.2, 0.8, 0.2, 0.8, 0.2)
      expect(isTraceSampled({} as TraceIdentifier, 50)).toBeTrue()
      expect(isTraceSampled({} as TraceIdentifier, 50)).toBeFalse()
      expect(isTraceSampled({} as TraceIdentifier, 50)).toBeTrue()
      expect(isTraceSampled({} as TraceIdentifier, 50)).toBeFalse()
      expect(isTraceSampled({} as TraceIdentifier, 50)).toBeTrue()
    })
  })
})
