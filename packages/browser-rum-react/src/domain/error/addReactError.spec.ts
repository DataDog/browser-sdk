import { createFakeInternalApi } from '../../../../browser-rum-core/test'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { addReactError } from './addReactError'

describe('addReactError', () => {
  it('collects the error through the internal API, formatted the RUM way', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeReactPlugin({ internalApi })
    const originalError = new Error('error message')

    addReactError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addEvent).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          type: 'error',
          error: jasmine.objectContaining({ message: 'error message', source: 'custom' }),
          context: {
            framework: 'react',
          },
        }),
        baggage: jasmine.objectContaining({
          domainContext: { error: originalError, handlingStack: jasmine.any(String) },
        }),
      })
    )
  })

  it('carries the component stack on the error event', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeReactPlugin({ internalApi })
    const originalError = new Error('error message')

    addReactError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(
      (addEvent.calls.mostRecent().args[0] as { baseRumEvent: { error: { handling_stack?: string } } }).baseRumEvent
        .error.handling_stack
    ).toBeDefined()
  })

  it('should merge dd_context from the original error with react error context', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeReactPlugin({ internalApi })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addReactError(originalError, {})

    expect((addEvent.calls.mostRecent().args[0] as { baseRumEvent: { context: object } }).baseRumEvent.context).toEqual(
      {
        framework: 'react',
        component: 'Menu',
        param: 123,
      }
    )
  })
})
