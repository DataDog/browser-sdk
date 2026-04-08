import { tagsEnricher, sanitizeTag } from './tagsEnricher'

function transform(options: Parameters<typeof tagsEnricher>[0], data: Record<string, unknown> = { message: 'test' }) {
  return tagsEnricher(options).transform(data) as Record<string, unknown> & { ddtags: string }
}

describe('tagsEnricher', () => {
  it('should add ddtags with sdk_version from options', () => {
    const result = transform({ sdkVersion: '1.0.0' })

    expect(result.ddtags).toBe('sdk_version:1.0.0')
  })

  it('should fall back to _dd.browser_sdk_version for sdk_version tag', () => {
    const result = transform({}, { message: 'test', _dd: { browser_sdk_version: '2.0.0' } })

    expect(result.ddtags).toBe('sdk_version:2.0.0')
  })

  it('should include env tag', () => {
    const result = transform({ env: 'production', sdkVersion: '1.0.0' })

    expect(result.ddtags).toContain('env:production')
  })

  it('should include service tag', () => {
    const result = transform({ service: 'my-app', sdkVersion: '1.0.0' })

    expect(result.ddtags).toContain('service:my-app')
  })

  it('should include version tag', () => {
    const result = transform({ version: '3.2.1', sdkVersion: '1.0.0' })

    expect(result.ddtags).toContain('version:3.2.1')
  })

  it('should combine all tags comma-separated', () => {
    const result = transform({ sdkVersion: '1.0.0', env: 'prod', service: 'web', version: '2.0.0' })

    expect(result.ddtags).toBe('sdk_version:1.0.0,env:prod,service:web,version:2.0.0')
  })

  it('should produce empty ddtags when no values provided', () => {
    const result = transform({})

    expect(result.ddtags).toBe('')
  })

  it('should preserve existing event fields', () => {
    const result = transform({ sdkVersion: '1.0.0' }, { message: 'test', status: 'info' })

    expect(result.message).toBe('test')
    expect(result.status).toBe('info')
  })

  it('should have name "tags"', () => {
    expect(tagsEnricher({}).name).toBe('tags')
  })
})

describe('sanitizeTag', () => {
  it('should replace commas with underscores', () => {
    expect(sanitizeTag('a,b,c')).toBe('a_b_c')
  })

  it('should not modify tags without commas', () => {
    expect(sanitizeTag('env:production')).toBe('env:production')
  })
})
