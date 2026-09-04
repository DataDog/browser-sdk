import { createFakeInternalApi } from '../../../../browser-rum-core/test'
import { initializeAngularPlugin } from '../../../test/initializeAngularPlugin'
import { addAngularError } from './addAngularError'

describe('addAngularError', () => {
  it('delegates the error to addError', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeAngularPlugin({ internalApi })
    const originalError = new Error('error message')

    addAngularError(originalError)

    expect(addEvent).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          type: 'error',
          error: jasmine.objectContaining({ message: 'error message' }),
          context: {
            framework: 'angular',
          },
        }),
        baggage: jasmine.objectContaining({
          domainContext: { error: originalError, handlingStack: jasmine.any(String) },
        }),
      })
    )
  })

  it('should merge dd_context from the original error with angular error context', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeAngularPlugin({ internalApi })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'UserList', param: 42 }

    addAngularError(originalError)

    expect(addEvent).toHaveBeenCalledWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          context: {
            framework: 'angular',
            component: 'UserList',
            param: 42,
          },
        }),
        baggage: jasmine.objectContaining({
          domainContext: { error: originalError, handlingStack: jasmine.any(String) },
        }),
      })
    )
  })

  it('handles non-Error values', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeAngularPlugin({ internalApi })

    addAngularError('string error')

    expect(addEvent).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          type: 'error',
          error: jasmine.objectContaining({ message: 'Provided "string error"' }),
          context: { framework: 'angular' },
        }),
        baggage: jasmine.objectContaining({
          domainContext: { error: 'string error', handlingStack: jasmine.any(String) },
        }),
      })
    )
  })
})
