import { validate } from './validation'

const validBase = {
  clientToken: 'abc',
  site: 'datadoghq.com',
}

describe('validate', () => {
  it('should return true for a valid configuration', () => {
    expect(validate(validBase)).toBe(true)
  })

  it('should return false and log an error when clientToken is missing', () => {
    const spy = spyOn(console, 'error')

    expect(validate({ site: 'datadoghq.com' } as any)).toBe(false)
    expect(spy).toHaveBeenCalledWith('clientToken is required')
  })

  it('should return false and log an error when site is missing', () => {
    const spy = spyOn(console, 'error')

    expect(validate({ clientToken: 'abc' } as any)).toBe(false)
    expect(spy).toHaveBeenCalledWith('site is required')
  })

  it('should return false and warn when sessionSampleRate is below 0', () => {
    const spy = spyOn(console, 'warn')

    expect(validate({ ...validBase, sessionSampleRate: -1 })).toBe(false)
    expect(spy).toHaveBeenCalledWith('sessionSampleRate must be between 0 and 100')
  })

  it('should return false and warn when sessionSampleRate is above 100', () => {
    const spy = spyOn(console, 'warn')

    expect(validate({ ...validBase, sessionSampleRate: 101 })).toBe(false)
    expect(spy).toHaveBeenCalledWith('sessionSampleRate must be between 0 and 100')
  })

  it('should return true when sessionSampleRate is 0', () => {
    expect(validate({ ...validBase, sessionSampleRate: 0 })).toBe(true)
  })

  it('should return true when sessionSampleRate is 100', () => {
    expect(validate({ ...validBase, sessionSampleRate: 100 })).toBe(true)
  })

  it('should return false and warn when telemetrySampleRate is out of range', () => {
    const spy = spyOn(console, 'warn')

    expect(validate({ ...validBase, telemetrySampleRate: 101 })).toBe(false)
    expect(spy).toHaveBeenCalledWith('telemetrySampleRate must be between 0 and 100')
  })

  it('should return false and warn when telemetryConfigurationSampleRate is out of range', () => {
    const spy = spyOn(console, 'warn')

    expect(validate({ ...validBase, telemetryConfigurationSampleRate: -1 })).toBe(false)
    expect(spy).toHaveBeenCalledWith('telemetryConfigurationSampleRate must be between 0 and 100')
  })

  it('should return false and warn when telemetryUsageSampleRate is out of range', () => {
    const spy = spyOn(console, 'warn')

    expect(validate({ ...validBase, telemetryUsageSampleRate: 101 })).toBe(false)
    expect(spy).toHaveBeenCalledWith('telemetryUsageSampleRate must be between 0 and 100')
  })
})
