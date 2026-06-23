import { registerCleanupTask } from '@openobserve/browser-core/test'
import { formatThrowable, formatUnknownError, safeReadErrorProperty } from './error'

describe('error', () => {
  describe('formatThrowable', () => {
    it('should format Error values with their message and a parsed stacktrace', () => {
      const result = formatThrowable(new Error('boom'))

      expect(result.message).toBe('boom')
      expect(result.stacktrace).toEqual(jasmine.any(Array))
    })

    it('should format cross-realm Error values', () => {
      const iframe = document.createElement('iframe')
      document.body.appendChild(iframe)
      registerCleanupTask(() => iframe.remove())
      const iframeWindow = iframe.contentWindow as Window & { Error: ErrorConstructor }

      const result = formatThrowable(new iframeWindow.Error('iframe error'))

      expect(result.message).toBe('iframe error')
      expect(result.stacktrace).toEqual(jasmine.any(Array))
    })

    it('should pass non-Error string values through unchanged', () => {
      expect(formatThrowable('thrown string')).toEqual({ message: 'thrown string', stacktrace: [] })
    })

    it('should sanitize non-Error values that cannot be coerced to strings', () => {
      expect(formatThrowable(Object.create(null))).toEqual({ message: '{}', stacktrace: [] })
    })

    it('should fall back when a non-Error value can neither be coerced nor sanitized', () => {
      const error = {
        toString() {
          throw new Error('Cannot coerce')
        },
        get x() {
          throw new Error('Cannot sanitize')
        },
      }

      expect(formatThrowable(error)).toEqual({
        message: '<error: unable to stringify thrown value>',
        stacktrace: [],
      })
    })

    it('should tolerate Error-like values with hostile message getters', () => {
      const error = {
        [Symbol.toStringTag]: 'Error',
        get message() {
          throw new Error('Cannot read message')
        },
      }

      expect(formatThrowable(error)).toEqual({ message: '[object Error]', stacktrace: [] })
    })
  })

  describe('formatUnknownError', () => {
    it('should format an Error as "name: message"', () => {
      expect(formatUnknownError(new TypeError('boom'))).toBe('TypeError: boom')
    })

    it('should coerce non-Error values to strings', () => {
      expect(formatUnknownError('plain string')).toBe('plain string')
      expect(formatUnknownError(42)).toBe('42')
    })

    it('should fall back when a non-Error value cannot be coerced', () => {
      const error = {
        toString() {
          throw new Error('Cannot coerce')
        },
      }

      expect(formatUnknownError(error)).toBe('<error: unable to stringify error>')
    })

    it('should tolerate Error-like values with hostile name and message getters', () => {
      const error = {
        [Symbol.toStringTag]: 'Error',
        get name() {
          throw new Error('Cannot read name')
        },
        get message() {
          throw new Error('Cannot read message')
        },
      }

      expect(formatUnknownError(error)).toBe('[object Error]')
    })
  })

  describe('safeReadErrorProperty', () => {
    it('should read string properties', () => {
      const error = new Error('boom')
      error.name = 'CustomError'

      expect(safeReadErrorProperty(error, 'name')).toBe('CustomError')
      expect(safeReadErrorProperty(error, 'message')).toBe('boom')
    })

    it('should return undefined for non-string properties', () => {
      const error = new Error()
      Object.defineProperty(error, 'message', { value: 42 })

      expect(safeReadErrorProperty(error, 'message')).toBeUndefined()
    })

    it('should return undefined when accessing the property throws', () => {
      const error = new Error()
      Object.defineProperty(error, 'message', {
        get() {
          throw new Error('Cannot read message')
        },
      })

      expect(safeReadErrorProperty(error, 'message')).toBeUndefined()
    })
  })
})
