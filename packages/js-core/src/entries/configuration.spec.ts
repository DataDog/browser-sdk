import type { Display } from '../util/display'
import { validateAndBuildConfiguration } from './configuration'
import type { MatchOption } from './configuration'

let display: jasmine.SpyObj<Display>

beforeEach(() => {
  display = jasmine.createSpyObj<Display>('display', ['debug', 'log', 'info', 'warn', 'error'])
})

describe('validateAndBuildConfiguration', () => {
  describe('string fields', () => {
    it('returns the value when valid', () => {
      const schema = { token: { type: 'string', required: true } } as const
      expect(validateAndBuildConfiguration({ token: 'abc' }, schema, display)).toEqual({ token: 'abc' })
    })

    it('returns undefined for the config when a required string is missing', () => {
      const schema = { token: { type: 'string', required: true } } as const
      expect(validateAndBuildConfiguration({}, schema, display)).toBeUndefined()
    })

    it('returns undefined for the config when a required string is empty', () => {
      const schema = { token: { type: 'string', required: true } } as const
      expect(validateAndBuildConfiguration({ token: '' }, schema, display)).toBeUndefined()
    })

    it('returns undefined for optional string that is missing', () => {
      const schema = { label: { type: 'string' } } as const
      expect(validateAndBuildConfiguration({}, schema, display)).toEqual({ label: undefined })
    })

    it('uses the default when optional string is missing', () => {
      const schema = { site: { type: 'string', default: 'datadoghq.com' } } as const
      expect(validateAndBuildConfiguration({}, schema, display)).toEqual({ site: 'datadoghq.com' })
    })

    it('falls back to default when optional string is invalid and strict is false', () => {
      const schema = { site: { type: 'string', default: 'datadoghq.com', strict: false } } as const
      expect(validateAndBuildConfiguration({ site: 42 }, schema, display)).toEqual({ site: 'datadoghq.com' })
    })
  })

  describe('percentage fields', () => {
    it('accepts 0', () => {
      const schema = { rate: { type: 'percentage', required: true } } as const
      expect(validateAndBuildConfiguration({ rate: 0 }, schema, display)).toEqual({ rate: 0 })
    })

    it('accepts 100', () => {
      const schema = { rate: { type: 'percentage', required: true } } as const
      expect(validateAndBuildConfiguration({ rate: 100 }, schema, display)).toEqual({ rate: 100 })
    })

    it('rejects values outside 0-100', () => {
      const schema = { rate: { type: 'percentage', default: 20 } } as const
      expect(validateAndBuildConfiguration({ rate: 101 }, schema, display)).toBeUndefined()
      expect(validateAndBuildConfiguration({ rate: -1 }, schema, display)).toBeUndefined()
    })

    it('uses default when missing', () => {
      const schema = { rate: { type: 'percentage', default: 20 } } as const
      expect(validateAndBuildConfiguration({}, schema, display)).toEqual({ rate: 20 })
    })

    it('falls back to default on invalid value when strict is false', () => {
      const schema = { rate: { type: 'percentage', default: 20, strict: false } } as const
      expect(validateAndBuildConfiguration({ rate: 101 }, schema, display)).toEqual({ rate: 20 })
    })
  })

  describe('enum fields with allowAll', () => {
    const VALUES = ['a', 'b', 'c'] as const
    const schema = {
      level: { type: 'enum', values: VALUES, multiple: true, allowAll: true, default: [] as string[] },
    } as const

    it('expands "all" to the full array-form value set', () => {
      expect(validateAndBuildConfiguration({ level: 'all' }, schema, display)).toEqual({ level: ['a', 'b', 'c'] })
    })

    it('expands "all" to the full object-form value set', () => {
      const objSchema = {
        apis: {
          type: 'enum' as const,
          values: { LOG: 'log', DEBUG: 'debug', INFO: 'info' } as const,
          multiple: true as const,
          allowAll: true as const,
          default: [] as string[],
        },
      }
      expect(validateAndBuildConfiguration({ apis: 'all' }, objSchema, display)).toEqual({
        apis: ['log', 'debug', 'info'],
      })
    })

    it('still accepts a normal array', () => {
      expect(validateAndBuildConfiguration({ level: ['a', 'b'] }, schema, display)).toEqual({ level: ['a', 'b'] })
    })

    it('uses the default when not provided', () => {
      expect(validateAndBuildConfiguration({}, schema, display)).toEqual({ level: [] })
    })
  })

  describe('enum fields (array form)', () => {
    const VALUES = ['a', 'b', 'c'] as const
    const schema = { level: { type: 'enum', values: VALUES, required: true } } as const

    it('accepts a value in the enum', () => {
      expect(validateAndBuildConfiguration({ level: 'a' }, schema, display)).toEqual({ level: 'a' })
    })

    it('rejects a value not in the enum', () => {
      expect(validateAndBuildConfiguration({ level: 'z' }, schema, display)).toBeUndefined()
    })

    it('uses the default when not provided', () => {
      const schemaWithDefault = {
        level: { type: 'enum', values: VALUES, default: 'a' },
      } as const
      expect(validateAndBuildConfiguration({}, schemaWithDefault, display)!.level).toBe('a')
    })

    it('falls back to default on invalid value when strict is false', () => {
      const schemaWithDefault = {
        level: { type: 'enum', values: VALUES, default: 'a', strict: false },
      } as const
      expect(validateAndBuildConfiguration({ level: 'z' }, schemaWithDefault, display)!.level).toBe('a')
    })

    it('infers the type as the enum values union', () => {
      const config = validateAndBuildConfiguration({ level: 'a' }, schema, display)!
      const _level: (typeof VALUES)[number] = config.level
      void _level
    })
  })

  describe('enum fields (object form)', () => {
    const CONSENT = { GRANTED: 'granted', NOT_GRANTED: 'not-granted' } as const
    const schema = { consent: { type: 'enum', values: CONSENT, default: CONSENT.GRANTED } } as const

    it('accepts a value that matches an enum value', () => {
      expect(validateAndBuildConfiguration({ consent: CONSENT.NOT_GRANTED }, schema, display)!.consent).toBe(
        CONSENT.NOT_GRANTED
      )
    })

    it('fails the config when an explicit invalid value is provided', () => {
      expect(validateAndBuildConfiguration({ consent: 'foo' }, schema, display)).toBeUndefined()
    })

    it('uses the default when not provided', () => {
      expect(validateAndBuildConfiguration({}, schema, display)!.consent).toBe(CONSENT.GRANTED)
    })

    it('falls back to default on invalid value when strict is false', () => {
      const schemaWithStrictFalse = {
        consent: { type: 'enum', values: CONSENT, default: CONSENT.GRANTED, strict: false },
      } as const
      expect(validateAndBuildConfiguration({ consent: 'foo' }, schemaWithStrictFalse, display)!.consent).toBe(
        CONSENT.GRANTED
      )
    })

    it('infers the type as the enum values union', () => {
      const config = validateAndBuildConfiguration({ consent: CONSENT.GRANTED }, schema, display)!
      const _consent: (typeof CONSENT)[keyof typeof CONSENT] = config.consent
      void _consent
    })
  })

  describe('multiple: true fields', () => {
    it('accepts an array of the base type', () => {
      const schema = { hosts: { type: 'string', multiple: true, default: [] } } as const
      expect(validateAndBuildConfiguration({ hosts: ['a', 'b'] }, schema, display)).toEqual({ hosts: ['a', 'b'] })
    })

    it('normalizes a single value to a single value array', () => {
      const schema = { hosts: { type: 'string', multiple: true, required: true } } as const
      expect(validateAndBuildConfiguration({ hosts: 'a' }, schema, display)).toEqual({ hosts: ['a'] })
    })

    it('aborts when an item is invalid', () => {
      const schema = { hosts: { type: 'string', multiple: true, default: [] } } as const
      expect(validateAndBuildConfiguration({ hosts: ['a', 1, 'b'] }, schema, display)).toBeUndefined()
    })

    it('uses default when the field is absent', () => {
      const schema = { hosts: { type: 'string', multiple: true, default: ['fallback'] } } as const
      expect(validateAndBuildConfiguration({}, schema, display)).toEqual({ hosts: ['fallback'] })
    })

    it('silently drops invalid items when strict: false', () => {
      const schema = {
        hosts: { type: 'string', multiple: true, strict: false },
      } as const
      expect(validateAndBuildConfiguration({ hosts: ['a', 1, 'b'] }, schema, display)).toEqual({ hosts: ['a', 'b'] })
    })
  })

  describe('site fields (via union)', () => {
    it('uses the matching variant result', () => {
      const schema = { site: { type: 'site', default: 'datadoghq.com', strict: false } } as const
      expect(validateAndBuildConfiguration({ site: 'datadoghq.eu' }, schema, display)).toEqual({ site: 'datadoghq.eu' })
      expect(validateAndBuildConfiguration({ site: 'evil.com' }, schema, display)).toEqual({ site: 'datadoghq.com' })
      expect(validateAndBuildConfiguration({}, schema, display)).toEqual({ site: 'datadoghq.com' })
    })

    it('rejects non-matching values in strict mode', () => {
      const schema = { flag: { type: 'boolean', required: true } } as const
      expect(validateAndBuildConfiguration({ flag: true }, schema, display)).toEqual({ flag: true })
      expect(validateAndBuildConfiguration({ flag: 'yes' }, schema, display)).toBeUndefined()
    })
  })

  describe('match-option fields', () => {
    const schema = { origins: { type: 'match-option', multiple: true, default: [] as MatchOption[] } } as const

    it('accepts strings', () => {
      expect(validateAndBuildConfiguration({ origins: ['https://example.com'] }, schema, display)!.origins).toEqual([
        'https://example.com',
      ])
    })

    it('accepts RegExp', () => {
      const re = /example/
      expect(validateAndBuildConfiguration({ origins: [re] }, schema, display)!.origins).toEqual([re])
    })

    it('accepts functions', () => {
      const fn = (url: string) => url.startsWith('https')
      expect(validateAndBuildConfiguration({ origins: [fn] }, schema, display)!.origins).toEqual([fn])
    })

    it('fails the config when an item is invalid', () => {
      expect(validateAndBuildConfiguration({ origins: [42] }, schema, display)).toBeUndefined()
    })

    it('uses default when not provided', () => {
      expect(validateAndBuildConfiguration({}, schema, display)!.origins).toEqual([])
    })

    it('silently drops invalid items when strict: false', () => {
      const schemaWithStrictFalse = {
        origins: { type: 'match-option', multiple: true, strict: false, default: [] as MatchOption[] },
      } as const
      expect(
        validateAndBuildConfiguration({ origins: ['https://example.com', 42] }, schemaWithStrictFalse, display)!.origins
      ).toEqual(['https://example.com'])
    })
  })

  describe('schema fields', () => {
    const schema = {
      point: {
        type: 'schema' as const,
        schema: {
          x: { type: 'percentage' as const, required: true as const },
          y: { type: 'percentage' as const, default: 0 },
        },
      },
    }

    it('validates a nested object against the sub-schema', () => {
      expect(validateAndBuildConfiguration({ point: { x: 50, y: 25 } }, schema, display)).toEqual({
        point: { x: 50, y: 25 },
      })
    })

    it('uses sub-schema defaults for missing optional fields', () => {
      expect(validateAndBuildConfiguration({ point: { x: 50 } }, schema, display)).toEqual({
        point: { x: 50, y: 0 },
      })
    })

    it('returns undefined when a required nested field is missing', () => {
      expect(validateAndBuildConfiguration({ point: {} }, schema, display)).toBeUndefined()
    })

    it('returns undefined when the value is not an object', () => {
      expect(validateAndBuildConfiguration({ point: 42 }, schema, display)).toBeUndefined()
    })

    it('uses the field default when the value is absent', () => {
      const schemaWithDefault = {
        point: {
          type: 'schema' as const,
          default: { x: 0, y: 0 },
          schema: {
            x: { type: 'percentage' as const, required: true as const },
            y: { type: 'percentage' as const, required: true as const },
          },
        },
      }
      expect(validateAndBuildConfiguration({}, schemaWithDefault, display)).toEqual({ point: { x: 0, y: 0 } })
    })
  })

  describe('union fields', () => {
    const schema = {
      value: {
        type: 'union' as const,
        default: undefined as string | number | undefined,
        variants: [{ type: 'string' as const }, { type: 'percentage' as const }],
      },
    }

    it('uses the first matching variant', () => {
      expect(validateAndBuildConfiguration({ value: 'hello' }, schema, display)).toEqual({ value: 'hello' })
      expect(validateAndBuildConfiguration({ value: 50 }, schema, display)).toEqual({ value: 50 })
    })

    it('returns undefined when no variant matches', () => {
      expect(validateAndBuildConfiguration({ value: true }, schema, display)).toBeUndefined()
    })

    it('uses the default when the value is absent', () => {
      expect(validateAndBuildConfiguration({}, schema, display)).toEqual({ value: undefined })
    })
  })

  describe('invalid value handling', () => {
    it('aborts the config in strict mode (default)', () => {
      const schema = { site: { type: 'string', default: 'datadoghq.com' } } as const
      expect(validateAndBuildConfiguration({ site: 42 }, schema, display)).toBeUndefined()
    })

    it('uses the default in strict: false mode', () => {
      const schema = { site: { type: 'string', default: 'datadoghq.com', strict: false } } as const
      expect(validateAndBuildConfiguration({ site: 42 }, schema, display)).toEqual({ site: 'datadoghq.com' })
      expect(validateAndBuildConfiguration({}, schema, display)).toEqual({ site: 'datadoghq.com' })
    })
  })

  describe('boolean fields', () => {
    it('preserves true and false', () => {
      const schema = { flag: { type: 'boolean', default: false } } as const
      expect(validateAndBuildConfiguration({ flag: true }, schema, display)!.flag).toBe(true)
      expect(validateAndBuildConfiguration({ flag: false }, schema, display)!.flag).toBe(false)
    })

    it('uses the default when missing', () => {
      const schema = { flag: { type: 'boolean', default: false } } as const
      expect(validateAndBuildConfiguration({}, schema, display)!.flag).toBe(false)
    })

    it('fails the config when a non-boolean value is provided', () => {
      const schema = { flag: { type: 'boolean', default: false } } as const
      expect(validateAndBuildConfiguration({ flag: 'yes' }, schema, display)).toBeUndefined()
    })

    it('coerces truthy non-boolean values when strict: false', () => {
      const schema = { flag: { type: 'boolean', default: false, strict: false } } as const
      expect(validateAndBuildConfiguration({ flag: 'yes' }, schema, display)!.flag).toBe(true)
    })
  })

  describe('site fields', () => {
    it('accepts valid Datadog site strings', () => {
      const schema = { site: { type: 'site', default: 'datadoghq.com' } } as const
      expect(validateAndBuildConfiguration({ site: 'datadoghq.eu' }, schema, display)!.site).toBe('datadoghq.eu')
      expect(validateAndBuildConfiguration({ site: 'us3.datadoghq.com' }, schema, display)!.site).toBe(
        'us3.datadoghq.com'
      )
    })

    it('uses default when site is not provided', () => {
      const schema = { site: { type: 'site', default: 'datadoghq.com' } } as const
      expect(validateAndBuildConfiguration({}, schema, display)!.site).toBe('datadoghq.com')
    })

    it('fails the config when an unrecognized site is provided', () => {
      const schema = { site: { type: 'site', default: 'datadoghq.com' } } as const
      expect(validateAndBuildConfiguration({ site: 'evil.com' }, schema, display)).toBeUndefined()
    })
  })

  describe('unknown fields', () => {
    it('strips fields not in the schema', () => {
      const schema = { token: { type: 'string', required: true } } as const
      expect(validateAndBuildConfiguration({ token: 'abc', extra: 'ignored' }, schema, display)).toEqual({
        token: 'abc',
      })
    })
  })

  describe('invalid initConfig', () => {
    it('returns undefined and displays an error when initConfig is undefined', () => {
      const schema = { token: { type: 'string' as const } }
      expect(validateAndBuildConfiguration(undefined, schema, display)).toBeUndefined()
      expect(display.error).toHaveBeenCalledOnceWith('Configuration must be an object')
    })

    it('returns undefined and displays an error when initConfig is null', () => {
      const schema = { token: { type: 'string' as const } }
      expect(validateAndBuildConfiguration(null, schema, display)).toBeUndefined()
      expect(display.error).toHaveBeenCalledOnceWith('Configuration must be an object')
    })

    it('returns undefined and displays an error when initConfig is not an object', () => {
      const schema = { token: { type: 'string' as const } }
      expect(validateAndBuildConfiguration('not an object', schema, display)).toBeUndefined()
      expect(display.error).toHaveBeenCalledOnceWith('Configuration must be an object')
    })
  })

  describe('type inference', () => {
    it('infers required fields as non-optional', () => {
      const schema = {
        token: { type: 'string', required: true },
      } as const

      // Compile-time check: token must be string (not string | undefined)
      const config = validateAndBuildConfiguration({ token: 'abc' }, schema, display)!
      const _token: string = config.token
      void _token
    })

    it('infers optional fields with defaults as non-optional', () => {
      const schema = {
        rate: { type: 'percentage', default: 20 },
      } as const

      const config = validateAndBuildConfiguration({}, schema, display)!
      const _rate: number = config.rate
      void _rate
    })

    it('infers optional fields without defaults as T | undefined', () => {
      const schema = {
        env: { type: 'string' },
      } as const

      const config = validateAndBuildConfiguration({}, schema, display)!
      const _env: string | undefined = config.env
      void _env
    })

    it('infers enum values as narrowed union', () => {
      const VALUES = ['debug', 'info', 'warn'] as const
      const schema = {
        level: { type: 'enum', values: VALUES, required: true },
      } as const

      const config = validateAndBuildConfiguration({ level: 'debug' }, schema, display)!
      const _level: 'debug' | 'info' | 'warn' = config.level
      void _level
    })
  })

  describe('display messages', () => {
    it('reports the right message for an invalid string', () => {
      const schema = { env: { type: 'string' as const } }
      validateAndBuildConfiguration({ env: 42 }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"env" must be a non-empty string')
    })

    it('reports the right message for an invalid percentage', () => {
      const schema = { rate: { type: 'percentage' as const, default: 100 } }
      validateAndBuildConfiguration({ rate: 200 }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"rate" must be a number between 0 and 100')
    })

    it('reports the right message for an invalid boolean', () => {
      const schema = { flag: { type: 'boolean' as const, default: false } }
      validateAndBuildConfiguration({ flag: 'yes' }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"flag" must be a boolean')
    })

    it('reports the right message for an invalid site', () => {
      const schema = { site: { type: 'site' as const, default: 'datadoghq.com' } }
      validateAndBuildConfiguration({ site: 'evil.com' }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith(
        '"site" must be a valid Datadog site. More details: https://docs.datadoghq.com/getting_started/site/.'
      )
    })

    it('reports the right message for an invalid match-option', () => {
      const schema = { origin: { type: 'match-option' as const } }
      validateAndBuildConfiguration({ origin: 42 }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"origin" must be a string, RegExp, or function')
    })

    it('reports the right message for an invalid enum (array form)', () => {
      const schema = { level: { type: 'enum' as const, values: ['a', 'b'] as const, default: 'a' as const } }
      validateAndBuildConfiguration({ level: 'z' }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"level" must be one of: "a", "b"')
    })

    it('reports the right message for an invalid enum (object form)', () => {
      const schema = {
        consent: {
          type: 'enum' as const,
          values: { YES: 'granted', NO: 'not-granted' } as const,
          default: 'granted' as const,
        },
      }
      validateAndBuildConfiguration({ consent: 'foo' }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"consent" must be one of: "granted", "not-granted"')
    })

    it('reports the right message for an invalid string field', () => {
      const schema = { token: { type: 'string' as const, default: 'fallback' } }
      validateAndBuildConfiguration({ token: 42 }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"token" must be a non-empty string')
    })

    it('reports the type message for a required field with wrong type', () => {
      const schema = { token: { type: 'string' as const, required: true as const } }
      validateAndBuildConfiguration({ token: 42 }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"token" must be a non-empty string')
    })

    it('reports "is required" for a missing required field', () => {
      const schema = { token: { type: 'string' as const, required: true as const } }
      validateAndBuildConfiguration({}, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"token" is required')
    })

    it('does not report an error when the value is absent', () => {
      const schema = { env: { type: 'string' as const } }
      validateAndBuildConfiguration({}, schema, display)
      expect(display.error).not.toHaveBeenCalled()
    })

    it('does not report an error for an empty string', () => {
      const schema = { env: { type: 'string' as const } }
      validateAndBuildConfiguration({ env: '' }, schema, display)
      expect(display.error).not.toHaveBeenCalled()
    })

    it('reports an error but continues when strict: false', () => {
      const schema = { rate: { type: 'percentage' as const, default: 100, strict: false as const } }
      const config = validateAndBuildConfiguration({ rate: 200 }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"rate" must be a number between 0 and 100')
      expect(config).toEqual({ rate: 100 })
    })

    it('reports an error for the first invalid item in a multiple field', () => {
      const schema = { hosts: { type: 'string' as const, multiple: true as const, default: [] as string[] } }
      validateAndBuildConfiguration({ hosts: ['a', 42] }, schema, display)
      expect(display.error).toHaveBeenCalledOnceWith('"hosts" must be a non-empty string')
    })
  })
})
