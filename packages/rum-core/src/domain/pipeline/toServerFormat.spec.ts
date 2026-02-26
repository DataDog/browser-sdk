import { toServerFormat } from './toServerFormat'

describe('toServerFormat', () => {
  it('should convert a resource observation to server format', () => {
    const enriched = {
      type: 'resource',
      startTime: 200,
      duration: 500,
      data: { type: 'resource', resource: { url: 'https://example.com' } },
      session: { id: 'sess-1', sessionReplay: 0 },
      view: { id: 'view-1', name: 'Home', url: 'https://page.com', referrer: '' },
      application: { id: 'app-1' },
      date: 1234567890000,
    }
    const result = toServerFormat(enriched as any)
    expect(result.type).toBe('resource')
    expect((result as any).session.id).toBe('sess-1')
    expect((result as any).view.id).toBe('view-1')
    expect((result as any).view.url).toBe('https://page.com')
  })

  it('should set has_replay to false when sessionReplay is OFF (0)', () => {
    const enriched = {
      data: {},
      session: { id: 'sess-1', sessionReplay: 0 },
    }
    const result = toServerFormat(enriched as any)
    expect((result as any).session.has_replay).toBe(false)
  })

  it('should set has_replay to true when sessionReplay is SAMPLED (1)', () => {
    const enriched = {
      data: {},
      session: { id: 'sess-1', sessionReplay: 1 },
    }
    const result = toServerFormat(enriched as any)
    expect((result as any).session.has_replay).toBe(true)
  })

  it('should spread base snake_case data into result', () => {
    const enriched = {
      data: {
        type: 'error',
        error: { id: 'err-1', message: 'oops', source: 'custom', source_type: 'browser' },
        date: 1234567890000,
      },
    }
    const result = toServerFormat(enriched as any)
    expect(result.type).toBe('error')
    expect((result as any).date).toBe(1234567890000)
  })

  it('should serialize connectivity with effective_type', () => {
    const enriched = {
      data: {},
      connectivity: { status: 'connected', effectiveType: '4g', interfaces: ['wifi'] },
    }
    const result = toServerFormat(enriched as any)
    expect((result as any).connectivity.effective_type).toBe('4g')
    expect((result as any).connectivity.status).toBe('connected')
  })

  it('should serialize feature_flags from featureFlags', () => {
    const enriched = {
      data: {},
      featureFlags: { myFlag: true },
    }
    const result = toServerFormat(enriched as any)
    expect((result as any).feature_flags).toEqual({ myFlag: true })
  })

  it('should serialize _dd configuration from _dd decorator contribution', () => {
    const enriched = {
      data: {},
      _dd: {
        formatVersion: 2,
        drift: 0,
        configuration: {
          sessionSampleRate: 100,
          sessionReplaySampleRate: 20,
        },
        browserSdkVersion: '5.0.0',
        sdkName: 'rum',
      },
    }
    const result = toServerFormat(enriched as any)
    expect((result as any)._dd.format_version).toBe(2)
    expect((result as any)._dd.browser_sdk_version).toBe('5.0.0')
    expect((result as any)._dd.configuration.session_sample_rate).toBe(100)
    expect((result as any)._dd.configuration.session_replay_sample_rate).toBe(20)
  })
})
