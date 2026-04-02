import { ErrorHandling, ErrorSource } from '.'

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
})
