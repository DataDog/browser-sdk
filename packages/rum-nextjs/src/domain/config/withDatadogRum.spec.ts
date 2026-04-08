/* eslint-disable @typescript-eslint/no-unsafe-call */
import { withDatadogRum } from './withDatadogRum'

describe('withDatadogRum', () => {
  const ENV_KEYS = ['VERCEL_GIT_COMMIT_SHA', 'DD_VERSION', 'VERCEL_ENV', 'DD_ENV'] as const
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    savedEnv = {}
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = savedEnv[key]
      }
    }
  })

  describe('version injection', () => {
    it('should inject version from VERCEL_GIT_COMMIT_SHA', () => {
      process.env.VERCEL_GIT_COMMIT_SHA = 'abc123'
      const result = withDatadogRum({}) as any
      expect(result.env.NEXT_PUBLIC_DD_VERSION).toBe('abc123')
    })

    it('should inject version from DD_VERSION', () => {
      process.env.DD_VERSION = '1.0.0'
      const result = withDatadogRum({}) as any
      expect(result.env.NEXT_PUBLIC_DD_VERSION).toBe('1.0.0')
    })

    it('should prefer VERCEL_GIT_COMMIT_SHA over DD_VERSION', () => {
      process.env.VERCEL_GIT_COMMIT_SHA = 'abc123'
      process.env.DD_VERSION = '1.0.0'
      const result = withDatadogRum({}) as any
      expect(result.env.NEXT_PUBLIC_DD_VERSION).toBe('abc123')
    })

    it('should not override user-set NEXT_PUBLIC_DD_VERSION', () => {
      process.env.VERCEL_GIT_COMMIT_SHA = 'abc123'
      const result = withDatadogRum({ env: { NEXT_PUBLIC_DD_VERSION: 'user-version' } }) as any
      expect(result.env.NEXT_PUBLIC_DD_VERSION).toBe('user-version')
    })
  })

  describe('env injection', () => {
    it('should inject env from VERCEL_ENV', () => {
      process.env.VERCEL_ENV = 'production'
      const result = withDatadogRum({}) as any
      expect(result.env.NEXT_PUBLIC_DD_ENV).toBe('production')
    })

    it('should inject env from DD_ENV', () => {
      process.env.DD_ENV = 'staging'
      const result = withDatadogRum({}) as any
      expect(result.env.NEXT_PUBLIC_DD_ENV).toBe('staging')
    })

    it('should prefer VERCEL_ENV over DD_ENV', () => {
      process.env.VERCEL_ENV = 'production'
      process.env.DD_ENV = 'staging'
      const result = withDatadogRum({}) as any
      expect(result.env.NEXT_PUBLIC_DD_ENV).toBe('production')
    })

    it('should not override user-set NEXT_PUBLIC_DD_ENV', () => {
      process.env.VERCEL_ENV = 'production'
      const result = withDatadogRum({ env: { NEXT_PUBLIC_DD_ENV: 'user-env' } }) as any
      expect(result.env.NEXT_PUBLIC_DD_ENV).toBe('user-env')
    })
  })

  describe('source maps', () => {
    it('should enable productionBrowserSourceMaps', () => {
      const result = withDatadogRum({}) as any
      expect(result.productionBrowserSourceMaps).toBe(true)
    })

    it('should not override productionBrowserSourceMaps when explicitly set to false', () => {
      const result = withDatadogRum({ productionBrowserSourceMaps: false }) as any
      expect(result.productionBrowserSourceMaps).toBeUndefined()
    })
  })

  describe('document-policy header', () => {
    it('should add document-policy header when profilingSampleRate > 0', async () => {
      const result = withDatadogRum({}, { profilingSampleRate: 50 }) as any
      expect(result.headers).toBeDefined()
      const headers = await result.headers()
      expect(headers).toEqual([
        {
          source: '/(.*)',
          headers: [{ key: 'Document-Policy', value: 'js-profiling' }],
        },
      ])
    })

    it('should not add headers function when profilingSampleRate is 0', () => {
      const result = withDatadogRum({}, { profilingSampleRate: 0 }) as any
      expect(result.headers).toBeUndefined()
    })

    it('should not add headers function when profilingSampleRate is not set', () => {
      const result = withDatadogRum({}) as any
      expect(result.headers).toBeUndefined()
    })

    it('should not add headers function when options is not provided', () => {
      const result = withDatadogRum({}) as any
      expect(result.headers).toBeUndefined()
    })

    it('should merge with existing user headers', async () => {
      const userHeaders = [
        {
          source: '/api/(.*)',
          headers: [{ key: 'X-Custom', value: 'test' }],
        },
      ]
      const config = {
        headers: () => Promise.resolve(userHeaders),
      }
      const result = withDatadogRum(config, { profilingSampleRate: 50 }) as any
      const headers = await result.headers()
      expect(headers).toEqual([
        ...userHeaders,
        {
          source: '/(.*)',
          headers: [{ key: 'Document-Policy', value: 'js-profiling' }],
        },
      ])
    })
  })

  describe('function config', () => {
    it('should handle function config', async () => {
      process.env.VERCEL_GIT_COMMIT_SHA = 'abc123'
      const configFn = (_phase: string, _context: any) => ({
        env: { CUSTOM: 'value' },
      })
      const wrappedFn = withDatadogRum(configFn) as any
      expect(typeof wrappedFn).toBe('function')
      const result = await wrappedFn('phase-production-build', { defaultConfig: {} })
      expect(result.env.NEXT_PUBLIC_DD_VERSION).toBe('abc123')
      expect(result.env.CUSTOM).toBe('value')
      expect(result.productionBrowserSourceMaps).toBe(true)
    })

    it('should handle async function config', async () => {
      process.env.DD_ENV = 'staging'
      const configFn = (_phase: string, _context: any) => Promise.resolve({
        reactStrictMode: true,
      })
      const wrappedFn = withDatadogRum(configFn) as any
      const result = await wrappedFn('phase-production-build', { defaultConfig: {} })
      expect(result.env.NEXT_PUBLIC_DD_ENV).toBe('staging')
      expect(result.reactStrictMode).toBe(true)
    })
  })

  describe('minimal config', () => {
    it('should handle an empty config object', () => {
      const result = withDatadogRum({}) as any
      expect(result.env).toBeDefined()
      expect(result.productionBrowserSourceMaps).toBe(true)
    })

    it('should preserve existing config properties', () => {
      const result = withDatadogRum({ reactStrictMode: true, swcMinify: true }) as any
      expect(result.reactStrictMode).toBe(true)
      expect(result.swcMinify).toBe(true)
    })
  })
})
