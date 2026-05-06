import { connectivityEnricher } from './connectivityEnricher'

function withConnection(value: any, fn: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, 'connection')
  Object.defineProperty(Navigator.prototype, 'connection', { get: () => value, configurable: true })
  try {
    fn()
  } finally {
    if (descriptor) {
      Object.defineProperty(Navigator.prototype, 'connection', descriptor)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (Navigator.prototype as any).connection
    }
  }
}

describe('connectivityEnricher', () => {
  it('should have name "connectivity"', () => {
    const enricher = connectivityEnricher()

    expect(enricher.name).toBe('connectivity')
  })

  it('should stamp connectivity.status even when navigator.connection is not available', () => {
    withConnection(undefined, () => {
      const enricher = connectivityEnricher()
      const result = enricher.transform({ type: 'error' }) as Record<string, unknown>

      expect((result.connectivity as any).status).toBe('connected')
    })
  })

  it('should stamp connectivity with status and connection details when available', () => {
    withConnection({ effectiveType: '4g', type: 'wifi' }, () => {
      const enricher = connectivityEnricher()
      const result = enricher.transform({ type: 'error' }) as Record<string, unknown>

      expect(result.connectivity).toEqual({ status: 'connected', effective_type: '4g', interfaces: ['wifi'] })
    })
  })

  it('should preserve existing fields', () => {
    withConnection({ effectiveType: '3g', type: 'cellular' }, () => {
      const enricher = connectivityEnricher()
      const result = enricher.transform({ type: 'resource', url: 'https://example.com' }) as Record<string, unknown>

      expect(result.type).toBe('resource')
      expect(result.url).toBe('https://example.com')
    })
  })
})
