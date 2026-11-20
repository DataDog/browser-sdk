import { describe, expect, it, vi } from 'vitest'
import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { addAngularError } from './addAngularError'

describe('addAngularError', () => {
  it('delegates the error to addError', async () => {
    const addErrorSpy = vi.fn()
    await initializeAngularPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')

    addAngularError(originalError)

    expect(addErrorSpy).toHaveBeenCalledExactlyOnceWith({
      error: originalError,
      handlingStack: expect.any(String),
      startClocks: expect.any(Object),
      context: {
        framework: 'angular',
      },
    })
  })

  it('should merge dd_context from the original error with angular error context', async () => {
    const addErrorSpy = vi.fn()
    await initializeAngularPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'UserList', param: 42 }

    addAngularError(originalError)

    expect(addErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: originalError,
        context: {
          framework: 'angular',
          component: 'UserList',
          param: 42,
        },
      })
    )
  })

  it('handles non-Error values', async () => {
    const addErrorSpy = vi.fn()
    await initializeAngularPlugin({
      addError: addErrorSpy,
    })

    addAngularError('string error')

    expect(addErrorSpy).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        error: 'string error',
        handlingStack: expect.any(String),
        startClocks: expect.any(Object),
        context: { framework: 'angular' },
      })
    )
  })

  it('does not throw when reading dd_context throws', async () => {
    const addErrorSpy = vi.fn()
    await initializeAngularPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')
    Object.defineProperty(originalError, 'dd_context', {
      get() {
        throw new Error('dd_context getter error')
      },
    })

    expect(() => addAngularError(originalError)).not.toThrow()
    expect(addErrorSpy).not.toHaveBeenCalled()
  })
})
