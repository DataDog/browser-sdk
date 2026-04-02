import { buildConfiguration } from './configuration'
import { validateConfiguration } from './validation'
import type { ConfigExtension } from './configuration'

const validBase = {
  clientToken: 'abc',
  site: 'datadoghq.com',
}

describe('buildConfiguration', () => {
  it('should build a valid base configuration with defaults', () => {
    const config = buildConfiguration(validBase, [])

    expect(config).toEqual({
      clientToken: 'abc',
      site: 'datadoghq.com',
      enabled: true,
      sessionSampleRate: 100,
      telemetrySampleRate: 20,
      telemetryConfigurationSampleRate: 5,
      telemetryUsageSampleRate: 5,
    })
  })

  it('should return null when clientToken is missing', () => {
    const config = buildConfiguration({ site: 'datadoghq.com' } as any, [])

    expect(config).toBeNull()
  })

  it('should return null when site is missing', () => {
    const config = buildConfiguration({ clientToken: 'abc' } as any, [])

    expect(config).toBeNull()
  })

  it('should return null when sessionSampleRate is out of range', () => {
    const config = buildConfiguration({ ...validBase, sessionSampleRate: 101 }, [])

    expect(config).toBeNull()
  })
})

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

  it('should respect enabled: false', () => {
    const config = buildConfiguration({ ...validBase, enabled: false }, [])

    expect(config!.enabled).toBe(false)
  })

  it('should respect custom sessionSampleRate', () => {
    const config = buildConfiguration({ ...validBase, sessionSampleRate: 50 }, [])

    expect(config!.sessionSampleRate).toBe(50)
  })

  it('should merge extension config into the assembled config', () => {
    interface RumInit {
      applicationId: string
    }
    interface RumConfig {
      applicationId: string
    }

    const rumExtension: ConfigExtension<'rum', RumInit, RumConfig> = {
      key: 'rum',
      validate: (init) => (init ? { applicationId: init.applicationId } : null),
    }

    const config = buildConfiguration({ ...validBase, rum: { applicationId: 'xyz' } } as any, [rumExtension])

    expect(config).toEqual({
      clientToken: 'abc',
      site: 'datadoghq.com',
      enabled: true,
      sessionSampleRate: 100,
      telemetrySampleRate: 20,
      telemetryConfigurationSampleRate: 5,
      telemetryUsageSampleRate: 5,
      rum: { applicationId: 'xyz' },
    })
  })

  it('should return null when an extension returns null', () => {
    const failingExtension: ConfigExtension<'rum', unknown, unknown> = {
      key: 'rum',
      validate: () => null,
    }

    const config = buildConfiguration({ ...validBase, rum: {} } as any, [failingExtension])

    expect(config).toBeNull()
  })

  it('should skip extension when its key is absent from init config', () => {
    const rumExtension: ConfigExtension<'rum', { applicationId: string }, { applicationId: string }> = {
      key: 'rum',
      validate: (init) => (init ? { applicationId: init.applicationId } : null),
    }

    const config = buildConfiguration(validBase, [rumExtension])

    expect(config).not.toBeNull()
    expect((config as any).rum).toBeUndefined()
  })
})
