import { vi, describe, it, expect } from 'vitest'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { resetNextjsPlugin } from '../nextjsPlugin'
import { initializeNextjsPlugin } from '../../../test/initializeNextjsPlugin'
import { addNextjsError } from './addNextjsError'

describe('addNextjsError', () => {
  it('does nothing when the plugin is not initialized', () => {
    registerCleanupTask(() => {
      resetNextjsPlugin()
    })
    expect(() => addNextjsError(new Error('test'))).not.toThrow()
  })

  it('delegates the error to addError', () => {
    const addErrorSpy = vi.fn()
    initializeNextjsPlugin({ addError: addErrorSpy })
    const originalError = new Error('test error')

    addNextjsError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addErrorSpy).toHaveBeenCalledTimes(1)
    expect(addErrorSpy).toHaveBeenCalledWith({
      error: originalError,
      handlingStack: expect.any(String),
      componentStack: 'at ComponentSpy toto.js',
      startClocks: expect.any(Object),
      context: { framework: 'nextjs' },
    })
  })

  it('merges dd_context from the original error with nextjs error context', () => {
    const addErrorSpy = vi.fn()
    initializeNextjsPlugin({ addError: addErrorSpy })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addNextjsError(originalError, {})

    expect(addErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: originalError,
        context: {
          framework: 'nextjs',
          component: 'Menu',
          param: 123,
        },
      })
    )
  })

  it('adds nextjs.digest context when error.digest is present', () => {
    const addErrorSpy = vi.fn()
    initializeNextjsPlugin({ addError: addErrorSpy })
    const error = Object.assign(new Error('server error'), { digest: 'abc123' })

    addNextjsError(error, {})

    expect(addErrorSpy.mock.lastCall![0]).toEqual(
      expect.objectContaining({
        context: expect.objectContaining({ framework: 'nextjs', nextjs: { digest: 'abc123' } }),
      })
    )
  })

  it('omits nextjs key when digest is undefined', () => {
    const addErrorSpy = vi.fn()
    initializeNextjsPlugin({ addError: addErrorSpy })
    const error = new Error('client error')

    addNextjsError(error)

    expect(addErrorSpy.mock.lastCall![0]).toEqual(
      expect.objectContaining({
        context: { framework: 'nextjs' },
      })
    )
  })

  it('omits componentStack when errorInfo is missing', () => {
    const addErrorSpy = vi.fn()
    initializeNextjsPlugin({ addError: addErrorSpy })
    const error = new Error('client error')

    addNextjsError(error)

    expect(addErrorSpy.mock.lastCall![0]).toEqual(
      expect.objectContaining({
        componentStack: undefined,
      })
    )
  })

  it('does not let error.dd_context overwrite framework', () => {
    const addErrorSpy = vi.fn()
    initializeNextjsPlugin({ addError: addErrorSpy })
    const error = Object.assign(new Error('test error'), { dd_context: { framework: 'from-dd-context' } })

    addNextjsError(error, {})

    expect(addErrorSpy.mock.lastCall![0]).toEqual(
      expect.objectContaining({
        context: expect.objectContaining({ framework: 'nextjs' }),
      })
    )
  })
})
