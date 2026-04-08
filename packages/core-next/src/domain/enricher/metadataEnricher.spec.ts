import { metadataEnricher } from './metadataEnricher'

function transform(
  options?: Parameters<typeof metadataEnricher>[0],
  data: Record<string, unknown> = { message: 'test' }
) {
  return metadataEnricher(options).transform(data) as Record<string, unknown>
}

describe('metadataEnricher', () => {
  it('should add date as timestamp', () => {
    const before = Date.now()
    const result = transform()
    const after = Date.now()

    expect(result.date as number).toBeGreaterThanOrEqual(before)
    expect(result.date as number).toBeLessThanOrEqual(after)
  })

  it('should not overwrite existing date', () => {
    const result = transform({}, { message: 'test', date: 12345 })

    expect(result.date).toBe(12345)
  })

  it('should add source as "browser" by default', () => {
    const result = transform()

    expect(result.source).toBe('browser')
  })

  it('should use custom source', () => {
    const result = transform({ source: 'flutter' })

    expect(result.source).toBe('flutter')
  })

  it('should add service when provided', () => {
    const result = transform({ service: 'my-app' })

    expect(result.service).toBe('my-app')
  })

  it('should not add service when not provided', () => {
    const result = transform()

    expect(result.service).toBeUndefined()
  })

  it('should preserve existing event fields', () => {
    const result = transform({}, { message: 'test', status: 'info' })

    expect(result.message).toBe('test')
    expect(result.status).toBe('info')
  })

  it('should have name "metadata"', () => {
    expect(metadataEnricher().name).toBe('metadata')
  })
})
