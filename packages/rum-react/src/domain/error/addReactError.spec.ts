import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { addReactError } from './addReactError'

describe('addReactError', () => {
  it('delegates the error to addError', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeReactPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')

    addReactError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addErrorSpy).toHaveBeenCalledOnceWith({
      error: originalError,
      handlingStack: jasmine.any(String),
      componentStack: 'at ComponentSpy toto.js',
      startClocks: jasmine.any(Object),
      context: {
        framework: 'react',
      },
    })
  })

  it('should merge dd_context from the original error with react error context', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeReactPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addReactError(originalError, {})

    expect(addErrorSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
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
