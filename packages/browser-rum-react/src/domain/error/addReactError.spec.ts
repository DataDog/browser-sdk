import { vi, describe, expect, it } from 'vitest'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { addReactError } from './addReactError'

describe('addReactError', () => {
  it('delegates the error to addError', () => {
    const addErrorSpy = vi.fn()
    initializeReactPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')

    addReactError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addErrorSpy).toHaveBeenCalledExactlyOnceWith({
      error: originalError,
      handlingStack: expect.any(String),
      componentStack: 'at ComponentSpy toto.js',
      startClocks: expect.any(Object),
      context: {
        framework: 'react',
      },
    })
  })

  it('should merge dd_context from the original error with react error context', () => {
    const addErrorSpy = vi.fn()
    initializeReactPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addReactError(originalError, {})

    expect(addErrorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        error: originalError,
        context: {
          framework: 'react',
          component: 'Menu',
          param: 123,
        },
      })
    )
  })
})
