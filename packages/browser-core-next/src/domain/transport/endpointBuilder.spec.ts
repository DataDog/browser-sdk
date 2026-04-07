import { createEndpointBuilder, buildIntakeHost } from './endpointBuilder'

describe('buildIntakeHost', () => {
  it('should build host for datadoghq.com', () => {
    expect(buildIntakeHost('datadoghq.com')).toBe('browser-intake-datadoghq.com')
  })

  it('should build host for datadoghq.eu', () => {
    expect(buildIntakeHost('datadoghq.eu')).toBe('browser-intake-datadoghq.eu')
  })

  it('should build host for us3.datadoghq.com', () => {
    expect(buildIntakeHost('us3.datadoghq.com')).toBe('browser-intake-us3-datadoghq.com')
  })

  it('should build host for us5.datadoghq.com', () => {
    expect(buildIntakeHost('us5.datadoghq.com')).toBe('browser-intake-us5-datadoghq.com')
  })

  it('should build host for ap1.datadoghq.com', () => {
    expect(buildIntakeHost('ap1.datadoghq.com')).toBe('browser-intake-ap1-datadoghq.com')
  })

  it('should build host for ddog-gov.com', () => {
    expect(buildIntakeHost('ddog-gov.com')).toBe('browser-intake-ddog-gov.com')
  })

  it('should build host for datad0g.com', () => {
    expect(buildIntakeHost('datad0g.com')).toBe('browser-intake-datad0g.com')
  })
})

describe('createEndpointBuilder', () => {
  it('should build a full URL with intake host, path, and query parameters', () => {
    const builder = createEndpointBuilder({
      clientToken: 'pub123',
      site: 'datadoghq.com',
      trackType: 'logs',
      sdkVersion: '1.0.0',
    })
    const url = builder.build()

    expect(url).toMatch(/^https:\/\/browser-intake-datadoghq\.com\/api\/v2\/logs\?/)
    expect(url).toContain('ddsource=browser')
    expect(url).toContain('dd-api-key=pub123')
    expect(url).toContain('dd-evp-origin-version=1.0.0')
    expect(url).toContain('dd-evp-origin=browser')
    expect(url).toContain('dd-request-id=')
    expect(url).toContain('batch_time=')
  })

  it('should use /api/v2/rum for rum track type', () => {
    const builder = createEndpointBuilder({
      clientToken: 'pub123',
      site: 'datadoghq.com',
      trackType: 'rum',
    })
    const url = builder.build()

    expect(url).toContain('/api/v2/rum?')
  })

  it('should generate unique request IDs on each build', () => {
    const builder = createEndpointBuilder({
      clientToken: 'pub123',
      site: 'datadoghq.com',
      trackType: 'logs',
    })
    const url1 = builder.build()
    const url2 = builder.build()

    const id1 = url1.match(/dd-request-id=([^&]+)/)![1]
    const id2 = url2.match(/dd-request-id=([^&]+)/)![1]
    expect(id1).not.toBe(id2)
  })

  it('should use proxy function when provided', () => {
    const proxy = jasmine
      .createSpy('proxy')
      .and.callFake(
        (options: { path: string; parameters: string }) =>
          `https://proxy.example.com${options.path}?${options.parameters}`
      )
    const builder = createEndpointBuilder({
      clientToken: 'pub123',
      site: 'datadoghq.com',
      trackType: 'logs',
      proxy,
    })
    const url = builder.build()

    expect(proxy).toHaveBeenCalled()
    expect(url).toMatch(/^https:\/\/proxy\.example\.com\/api\/v2\/logs\?/)
    expect(url).toContain('dd-api-key=pub123')
  })

  it('should use proxy string when provided', () => {
    const builder = createEndpointBuilder({
      clientToken: 'pub123',
      site: 'datadoghq.com',
      trackType: 'logs',
      proxy: 'https://proxy.example.com/forward',
    })
    const url = builder.build()

    expect(url).toMatch(/^https:\/\/proxy\.example\.com\/forward\?ddforward=/)
    expect(url).toContain(encodeURIComponent('/api/v2/logs'))
  })

  it('should expose the track type', () => {
    const builder = createEndpointBuilder({
      clientToken: 'pub123',
      site: 'datadoghq.com',
      trackType: 'logs',
    })

    expect(builder.trackType).toBe('logs')
  })
})
