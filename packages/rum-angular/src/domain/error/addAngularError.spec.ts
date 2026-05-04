import { describe, it, expect, vi } from 'vitest'
import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { addAngularError } from './addAngularError'

describe('addAngularError', () => {
  it('delegates the error to addError', () => {
    const addErrorSpy = vi.fn()
    initializeAngularPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')

    addAngularError(originalError)

    expect(addErrorSpy).toHaveBeenCalledTimes(1)
    expect(addErrorSpy).toHaveBeenCalledWith({
      error: originalError,
      handlingStack: expect.any(String),
      startClocks: expect.any(Object),
      context: {
        framework: 'angular',
      },
    })
  })

  it('should merge dd_context from the original error with angular error context', () => {
    const addErrorSpy = vi.fn()
    initializeAngularPlugin({
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

  it('handles non-Error values', () => {
    const addErrorSpy = vi.fn()
    initializeAngularPlugin({
      addError: addErrorSpy,
    })

    addAngularError('string error')

    expect(addErrorSpy).toHaveBeenCalledTimes(1)
    expect(addErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'string error',
        handlingStack: expect.any(String),
        startClocks: expect.any(Object),
        context: { framework: 'angular' },
      })
    )
  })
})
