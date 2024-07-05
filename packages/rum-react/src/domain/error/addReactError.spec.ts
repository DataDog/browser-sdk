import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { addReactError } from './addReactError'

describe('addReactError', () => {
  it('reports the error to the SDK', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeReactPlugin({
      publicApi: {
        addError: addErrorSpy,
      },
    })
    const originalError = new Error('error')

    addReactError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addErrorSpy).toHaveBeenCalledOnceWith(jasmine.any(Error), { framework: 'react' })
    const error = addErrorSpy.calls.first().args[0]
    expect(error.message).toBe('error')
    expect(error.name).toBe('ReactRenderingError')
    expect(error.stack).toContain('at ComponentSpy')
    expect(error.cause).toBe(originalError)
  })
})
