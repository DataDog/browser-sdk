import { buildConfiguration } from './configuration'
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
