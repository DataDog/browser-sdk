import { vi, describe, expect, it } from 'vitest'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { addReactError } from './addReactError'

describe('addReactError', () => {
  it('reports the error to the SDK', () => {
    const addEventSpy = vi.fn()
    initializeReactPlugin({
      addError: addEventSpy,
    })
    const originalError = new Error('error message')

    addReactError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addEventSpy).toHaveBeenCalledTimes(1)
    expect(addEventSpy).toHaveBeenCalledExactlyOnceWith({
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
    const addEventSpy = vi.fn()
    initializeReactPlugin({
      addError: addEventSpy,
    })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addReactError(originalError, {})

    expect(addEventSpy.mock.lastCall![0]).toEqual(
      expect.objectContaining({
        context: {
          framework: 'react',
          component: 'Menu',
          param: 123,
        },
      })
    )
  })
})
