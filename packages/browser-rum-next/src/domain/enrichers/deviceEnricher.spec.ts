import { deviceEnricher } from './deviceEnricher'

describe('deviceEnricher', () => {
  it('stamps device.locale with navigator.language', () => {
    const enricher = deviceEnricher()

    const result = enricher.transform({ type: 'view' }) as Record<string, unknown>

    const device = result.device as Record<string, unknown>
    expect(device.locale).toBe(navigator.language)
  })

  it('stamps device.locales as array', () => {
    const enricher = deviceEnricher()

    const result = enricher.transform({ type: 'view' }) as Record<string, unknown>

    const device = result.device as Record<string, unknown>
    expect(Array.isArray(device.locales)).toBe(true)
    expect((device.locales as string[]).length).toBeGreaterThan(0)
  })

  it('stamps device.time_zone from Intl', () => {
    const enricher = deviceEnricher()

    const result = enricher.transform({ type: 'view' }) as Record<string, unknown>

    const device = result.device as Record<string, unknown>
    expect(typeof device.time_zone).toBe('string')
    expect((device.time_zone as string).length).toBeGreaterThan(0)
  })

  it('preserves existing fields', () => {
    const enricher = deviceEnricher()

    const result = enricher.transform({ type: 'error', url: 'https://example.com' }) as Record<string, unknown>

    expect(result.type).toBe('error')
    expect(result.url).toBe('https://example.com')
    expect(result.device).toBeDefined()
  })
})
