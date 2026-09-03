import { registerCleanupTask } from '@datadog/browser-core/test'
import { resetNextjsPlugin } from '../nextjsPlugin'
import { initializeNextjsPlugin } from '../../../test/initializeNextjsPlugin'
import { createFakeInternalApi } from '../../../../browser-rum-core/test'
import { addNextjsError } from './addNextjsError'

describe('addNextjsError', () => {
  it('does nothing when the plugin is not initialized', () => {
    registerCleanupTask(() => {
      resetNextjsPlugin()
    })
    expect(() => addNextjsError(new Error('test'))).not.toThrow()
  })

  it('delegates the error to addError', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNextjsPlugin({ internalApi })
    const originalError = new Error('test error')

    addNextjsError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addEvent).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          type: 'error',
          error: jasmine.objectContaining({
            message: 'test error',
            component_stack: 'at ComponentSpy toto.js',
          }),
          context: { framework: 'nextjs' },
        }),
        baggage: jasmine.objectContaining({ originalError }),
      })
    )
  })

  it('merges dd_context from the original error with nextjs error context', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNextjsPlugin({ internalApi })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addNextjsError(originalError, {})

    expect(addEvent).toHaveBeenCalledWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          context: {
            framework: 'nextjs',
            component: 'Menu',
            param: 123,
          },
        }),
        baggage: jasmine.objectContaining({ originalError }),
      })
    )
  })

  it('adds nextjs.digest context when error.digest is present', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNextjsPlugin({ internalApi })
    const error = Object.assign(new Error('server error'), { digest: 'abc123' })

    addNextjsError(error, {})

    expect((addEvent.calls.mostRecent().args[0] as { baseRumEvent: { context: object } }).baseRumEvent.context).toEqual(
      jasmine.objectContaining({ framework: 'nextjs', nextjs: { digest: 'abc123' } })
    )
  })

  it('omits nextjs key when digest is undefined', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNextjsPlugin({ internalApi })
    const error = new Error('client error')

    addNextjsError(error)

    expect((addEvent.calls.mostRecent().args[0] as { baseRumEvent: { context: object } }).baseRumEvent.context).toEqual(
      { framework: 'nextjs' }
    )
  })

  it('omits componentStack when errorInfo is missing', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNextjsPlugin({ internalApi })
    const error = new Error('client error')

    addNextjsError(error)

    expect(
      (addEvent.calls.mostRecent().args[0] as { baseRumEvent: { error: { component_stack?: string } } }).baseRumEvent
        .error.component_stack
    ).toBeUndefined()
  })

  it('does not let error.dd_context overwrite framework', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNextjsPlugin({ internalApi })
    const error = Object.assign(new Error('test error'), { dd_context: { framework: 'from-dd-context' } })

    addNextjsError(error, {})

    expect((addEvent.calls.mostRecent().args[0] as { baseRumEvent: { context: object } }).baseRumEvent.context).toEqual(
      jasmine.objectContaining({ framework: 'nextjs' })
    )
  })
})
