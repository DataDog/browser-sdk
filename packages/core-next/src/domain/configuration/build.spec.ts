import { build } from './build'
import type { Extension } from '.'

const validBase = {
  clientToken: 'abc',
  site: 'datadoghq.com',
}

describe('build', () => {
  it('should build a valid base configuration with defaults', () => {
    const config = build(validBase, [])

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
    expect(build({ site: 'datadoghq.com' } as any, [])).toBeNull()
  })

  it('should return null when site is missing', () => {
    expect(build({ clientToken: 'abc' } as any, [])).toBeNull()
  })

  it('should return null when sessionSampleRate is out of range', () => {
    expect(build({ ...validBase, sessionSampleRate: 101 }, [])).toBeNull()
  })

  it('should respect enabled: false', () => {
    const config = build({ ...validBase, enabled: false }, [])

    expect(config!.enabled).toBe(false)
  })

  it('should respect custom sessionSampleRate', () => {
    const config = build({ ...validBase, sessionSampleRate: 50 }, [])

    expect(config!.sessionSampleRate).toBe(50)
  })

  it('should merge extension config into the assembled config', () => {
    interface RumInit {
      applicationId: string
    }
    interface RumConfig {
      applicationId: string
    }

    const rumExtension: Extension<'rum', RumInit, RumConfig> = {
      key: 'rum',
      validate: (init) => (init ? { applicationId: init.applicationId } : null),
    }

    const config = build({ ...validBase, rum: { applicationId: 'xyz' } } as any, [rumExtension])

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
    const failingExtension: Extension<'rum', unknown, unknown> = {
      key: 'rum',
      validate: () => null,
    }

    expect(build({ ...validBase, rum: {} } as any, [failingExtension])).toBeNull()
  })

  it('should skip extension when its key is absent from init config', () => {
    const rumExtension: Extension<'rum', { applicationId: string }, { applicationId: string }> = {
      key: 'rum',
      validate: (init) => (init ? { applicationId: init.applicationId } : null),
    }

    const config = build(validBase, [rumExtension])

    expect(config).not.toBeNull()
    expect((config as any).rum).toBeUndefined()
  })

  it('should merge extension build output under the same key', () => {
    interface RumInit {
      sessionSampleRate: number
    }
    interface RumConfig {
      sessionSampleRate: number
    }
    interface RumDerived {
      enabled: boolean
    }

    const rumExtension: Extension<'rum', RumInit, RumConfig, RumDerived> = {
      key: 'rum',
      validate: (init) => (init ? { sessionSampleRate: init.sessionSampleRate } : null),
      build: (config) => ({ enabled: config.sessionSampleRate > 0 }),
    }

    const config = build({ ...validBase, rum: { sessionSampleRate: 100 } } as any, [rumExtension])

    expect(config).not.toBeNull()
    expect((config as any).rum).toEqual({ sessionSampleRate: 100, enabled: true })
  })

  it('should not include derived values when build is not defined', () => {
    const simpleExtension: Extension<'logs', { level: string }, { level: string }> = {
      key: 'logs',
      validate: (init) => (init ? { level: init.level } : null),
    }

    const config = build({ ...validBase, logs: { level: 'error' } } as any, [simpleExtension])

    expect(config).not.toBeNull()
    expect((config as any).logs).toEqual({ level: 'error' })
  })
})
