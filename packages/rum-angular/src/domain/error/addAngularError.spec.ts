import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { addAngularError } from './addAngularError'

describe('addAngularError', () => {
  it('delegates the error to addError', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeAngularPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')

    addAngularError(originalError)

    expect(addErrorSpy).toHaveBeenCalledOnceWith({
      error: originalError,
      handlingStack: jasmine.any(String),
      startClocks: jasmine.any(Object),
      context: {
        framework: 'angular',
      },
    })
  })

  it('should merge dd_context from the original error with angular error context', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeAngularPlugin({
      addError: addErrorSpy,
    })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'UserList', param: 42 }

    addAngularError(originalError)

    expect(addErrorSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
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
    const addErrorSpy = jasmine.createSpy()
    initializeAngularPlugin({
      addError: addErrorSpy,
    })

    addAngularError('string error')

    expect(addErrorSpy).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        error: 'string error',
        handlingStack: jasmine.any(String),
        startClocks: jasmine.any(Object),
        context: { framework: 'angular' },
      })
    )
  })
})
