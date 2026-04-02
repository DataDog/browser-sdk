import { validateConfiguration } from './validation'

const validBase = {
  clientToken: 'abc',
  site: 'datadoghq.com',
}

describe('validateConfiguration', () => {
  it('should return true for a valid configuration', () => {
    expect(validateConfiguration(validBase)).toBe(true)
  })

  it('should return false when clientToken is missing', () => {
    expect(validateConfiguration({ site: 'datadoghq.com' } as any)).toBe(false)
  })

  it('should return false when site is missing', () => {
    expect(validateConfiguration({ clientToken: 'abc' } as any)).toBe(false)
  })

  it('should return false when sessionSampleRate is below 0', () => {
    expect(validateConfiguration({ ...validBase, sessionSampleRate: -1 })).toBe(false)
  })

  it('should return false when sessionSampleRate is above 100', () => {
    expect(validateConfiguration({ ...validBase, sessionSampleRate: 101 })).toBe(false)
  })

  it('should return true when sessionSampleRate is 0', () => {
    expect(validateConfiguration({ ...validBase, sessionSampleRate: 0 })).toBe(true)
  })

  it('should return true when sessionSampleRate is 100', () => {
    expect(validateConfiguration({ ...validBase, sessionSampleRate: 100 })).toBe(true)
  })

  it('should return false when telemetrySampleRate is out of range', () => {
    expect(validateConfiguration({ ...validBase, telemetrySampleRate: 101 })).toBe(false)
  })

  it('should return false when telemetryConfigurationSampleRate is out of range', () => {
    expect(validateConfiguration({ ...validBase, telemetryConfigurationSampleRate: -1 })).toBe(false)
  })

  it('should return false when telemetryUsageSampleRate is out of range', () => {
    expect(validateConfiguration({ ...validBase, telemetryUsageSampleRate: 101 })).toBe(false)
  })
})
