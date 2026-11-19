import { describe, expect, it } from 'vitest'
import { safeStringify, safeToString } from './stringify'

describe('stringify', () => {
  describe('safeToString', () => {
    it('should stringify values', () => {
      expect(safeToString('foo')).toBe('foo')
      expect(safeToString(42)).toBe('42')
      expect(safeToString({ foo: 'bar' })).toBe('[object Object]')
    })

    it('should return undefined when coercion throws', () => {
      expect(
        safeToString({
          toString() {
            throw new Error('Cannot coerce')
          },
        })
      ).toBeUndefined()
    })
  })

  describe('safeStringify', () => {
    it('should stringify sanitized values', () => {
      expect(safeStringify({ foo: 'bar' })).toBe('{"foo":"bar"}')
      expect(safeStringify(Object.create(null))).toBe('{}')
    })

    it('should return undefined when stringifying undefined', () => {
      expect(safeStringify(undefined)).toBeUndefined()
    })

    it('should return undefined when sanitization throws', () => {
      const value = {
        get x() {
          throw new Error('Cannot sanitize')
        },
      }

      expect(safeStringify(value)).toBeUndefined()
    })
  })
})
