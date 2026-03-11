import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { computeStackTrace, toStackTraceString } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { nextjsPlugin, resetNextjsPlugin } from '../nextjsPlugin'
import { addNextjsError } from './addNextjsError'

const INIT_CONFIGURATION = {} as RumInitConfiguration

function initializeNextjsPlugin() {
  const addEventSpy = jasmine.createSpy()
  const publicApi = { startView: jasmine.createSpy() } as unknown as RumPublicApi
  const plugin = nextjsPlugin()
  plugin.onInit({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })
  plugin.onRumStart({ addEvent: addEventSpy } as unknown as StartRumResult)
  registerCleanupTask(() => {
    resetNextjsPlugin()
  })
  return { addEventSpy }
}

describe('addNextjsError', () => {
  it('does nothing when the plugin is not initialized', () => {
    registerCleanupTask(() => {
      resetNextjsPlugin()
    })
    expect(() => addNextjsError(new Error('test'))).not.toThrow()
  })

  it('reports the error to the SDK', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const originalError = new Error('test error')

    addNextjsError(originalError)

    expect(addEventSpy).toHaveBeenCalledOnceWith(
      jasmine.any(Number),
      {
        type: RumEventType.ERROR,
        date: jasmine.any(Number),
        error: jasmine.objectContaining({
          id: jasmine.any(String),
          type: originalError.name,
          message: originalError.message,
          stack: toStackTraceString(computeStackTrace(originalError)),
          handling_stack: jasmine.any(String),
          source_type: 'browser',
          handling: 'handled',
        }),
        context: { framework: 'nextjs' },
      },
      {
        error: originalError,
        handlingStack: jasmine.any(String),
      }
    )
  })

  it('passes user context through', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const error = new Error('test error')

    addNextjsError(error, { foo: 'bar' })

    expect(addEventSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        context: jasmine.objectContaining({ framework: 'nextjs', foo: 'bar' }),
      })
    )
  })

  it('adds nextjs.digest context when error.digest is present', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const error = Object.assign(new Error('server error'), { digest: 'abc123' })

    addNextjsError(error)

    expect(addEventSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        context: jasmine.objectContaining({ framework: 'nextjs', nextjs: { digest: 'abc123' } }),
      })
    )
  })

  it('omits nextjs key when digest is undefined', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const error = new Error('client error')

    addNextjsError(error)

    expect(addEventSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        context: { framework: 'nextjs' },
      })
    )
  })

  it('merges user context with digest context', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const error = Object.assign(new Error('server error'), { digest: 'xyz789' })

    addNextjsError(error, { customKey: 'customValue' })

    expect(addEventSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        context: jasmine.objectContaining({
          framework: 'nextjs',
          customKey: 'customValue',
          nextjs: { digest: 'xyz789' },
        }),
      })
    )
  })

  it('does not let user context overwrite framework', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const error = new Error('client error')

    addNextjsError(error, { framework: 'user-provided' })

    expect(addEventSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        context: jasmine.objectContaining({ framework: 'nextjs' }),
      })
    )
  })

  it('does not let user context overwrite digest', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const error = Object.assign(new Error('server error'), { digest: 'abc123' })

    addNextjsError(error, { nextjs: { digest: 'user-provided' } })

    expect(addEventSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        context: jasmine.objectContaining({ nextjs: { digest: 'abc123' } }),
      })
    )
  })

  it('does not spread non-object context?.nextjs when merging with digest', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const error = Object.assign(new Error('server error'), { digest: 'abc123' })

    addNextjsError(error, { nextjs: 'oops' })

    expect(addEventSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        context: jasmine.objectContaining({ framework: 'nextjs', nextjs: { digest: 'abc123' } }),
      })
    )
  })

  it('sanitizes non-serializable values in user context', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const error = new Error('test error')
    const circular: Record<string, unknown> = {}
    circular.self = circular

    addNextjsError(error, { safe: 'value', circular })

    const context = addEventSpy.calls.mostRecent().args[1].context as Record<string, unknown>
    expect(context['safe']).toBe('value')
    // circular reference is replaced with a string placeholder rather than crashing serialization
    expect(typeof (context['circular'] as Record<string, unknown>)['self']).toBe('string')
  })

  it('user context wins over error.dd_context', () => {
    const { addEventSpy } = initializeNextjsPlugin()
    const error = Object.assign(new Error('test error'), { dd_context: { source: 'from-dd-context' } })

    addNextjsError(error, { source: 'from-user-context' })

    expect(addEventSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        context: jasmine.objectContaining({ source: 'from-user-context' }),
      })
    )
  })
})
