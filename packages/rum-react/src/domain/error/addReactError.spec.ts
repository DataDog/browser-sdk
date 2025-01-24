import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { addReactError } from './addReactError'

describe('addReactError', () => {
  it('reports the error to the SDK', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeReactPlugin({
      strategy: {
        addError: addErrorSpy,
      },
    })
    const originalError = new Error('error message')
    originalError.name = 'CustomError'

    addReactError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addErrorSpy).toHaveBeenCalledOnceWith({
      error: jasmine.any(Error),
      handlingStack: jasmine.any(String),
      componentStack: jasmine.stringContaining('at ComponentSpy'),
      context: { framework: 'react' },
      startClocks: jasmine.anything(),
    })
    const { error } = addErrorSpy.calls.first().args[0]
    expect(error.message).toBe(originalError.message)
    expect(error.name).toBe(originalError.name)
    expect(error.stack).toBe(originalError.stack)
    expect(error.cause).toBe(undefined)
  })
})
