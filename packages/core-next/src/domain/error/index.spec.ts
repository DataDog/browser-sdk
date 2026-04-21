import { ErrorHandling, ErrorSource, flattenCauses, extractFingerprint } from '.'

describe('error primitives', () => {
  describe('ErrorSource', () => {
    it('should define all expected source values', () => {
      expect(ErrorSource.AGENT).toBe('agent')
      expect(ErrorSource.CONSOLE).toBe('console')
      expect(ErrorSource.CUSTOM).toBe('custom')
      expect(ErrorSource.LOGGER).toBe('logger')
      expect(ErrorSource.NETWORK).toBe('network')
      expect(ErrorSource.SOURCE).toBe('source')
      expect(ErrorSource.REPORT).toBe('report')
    })
  })

  describe('ErrorHandling', () => {
    it('should define handled and unhandled values', () => {
      expect(ErrorHandling.HANDLED).toBe('handled')
      expect(ErrorHandling.UNHANDLED).toBe('unhandled')
    })
  })

  describe('flattenCauses', () => {
    it('should return undefined when error has no cause', () => {
      expect(flattenCauses(new Error('no cause'))).toBeUndefined()
    })

    it('should flatten a single cause', () => {
      const cause = new Error('root cause')
      const error = new Error('top', { cause })

      const causes = flattenCauses(error)

      expect(causes).toEqual([{ message: 'root cause', type: 'Error', stack: cause.stack }])
    })

    it('should flatten a chain of causes', () => {
      const root = new Error('root')
      const mid = new Error('mid', { cause: root })
      const top = new Error('top', { cause: mid })

      const causes = flattenCauses(top)

      expect(causes?.length).toBe(2)
      expect(causes![0].message).toBe('mid')
      expect(causes![1].message).toBe('root')
    })

    it('should stop traversal when cause is not an Error', () => {
      const error = new Error('top', { cause: 'string cause' as any })

      expect(flattenCauses(error)).toBeUndefined()
    })

    it('should preserve error type name', () => {
      const cause = new TypeError('bad type')
      const error = new Error('top', { cause })

      const causes = flattenCauses(error)

      expect(causes![0].type).toBe('TypeError')
    })
  })

  describe('extractFingerprint', () => {
    it('should return undefined when error is undefined', () => {
      expect(extractFingerprint(undefined)).toBeUndefined()
    })

    it('should return undefined when error has no dd_fingerprint', () => {
      expect(extractFingerprint(new Error('test'))).toBeUndefined()
    })

    it('should return the fingerprint as a string', () => {
      const error = new Error('test')
      ;(error as any).dd_fingerprint = 'my-fingerprint'

      expect(extractFingerprint(error)).toBe('my-fingerprint')
    })

    it('should coerce non-string fingerprints to string', () => {
      const error = new Error('test')
      ;(error as any).dd_fingerprint = 42

      expect(extractFingerprint(error)).toBe('42')
    })
  })
})
