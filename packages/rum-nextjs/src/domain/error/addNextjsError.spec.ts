import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import { nextjsPlugin, resetNextjsPlugin } from '../nextjsPlugin'
import { addNextjsError } from './addNextjsError'

const INIT_CONFIGURATION = {} as RumInitConfiguration

function initializeNextjsPlugin() {
  const addErrorSpy = jasmine.createSpy()
  const publicApi = { startView: jasmine.createSpy() } as unknown as RumPublicApi
  const plugin = nextjsPlugin()
  plugin.onInit({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })
  plugin.onRumStart({ addError: addErrorSpy })
  registerCleanupTask(() => {
    resetNextjsPlugin()
  })
  return { addErrorSpy }
}

describe('addNextjsError', () => {
  it('does nothing when the plugin is not initialized', () => {
    registerCleanupTask(() => {
      resetNextjsPlugin()
    })
    expect(() => addNextjsError(new Error('test'))).not.toThrow()
  })

  it('delegates the error to addError', () => {
    const { addErrorSpy } = initializeNextjsPlugin()
    const originalError = new Error('test error')

    addNextjsError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addErrorSpy).toHaveBeenCalledOnceWith({
      error: originalError,
      handlingStack: jasmine.any(String),
      componentStack: 'at ComponentSpy toto.js',
      startClocks: jasmine.any(Object),
      context: { framework: 'nextjs' },
    })
  })

  it('merges dd_context from the original error with nextjs error context', () => {
    const { addErrorSpy } = initializeNextjsPlugin()
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addNextjsError(originalError, {})

    expect(addErrorSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({
        error: originalError,
        context: {
          framework: 'nextjs',
          component: 'Menu',
          param: 123,
        },
      })
    )
  })

  it('adds nextjs.digest context when error.digest is present', () => {
    const { addErrorSpy } = initializeNextjsPlugin()
    const error = Object.assign(new Error('server error'), { digest: 'abc123' })

    addNextjsError(error, {})

    expect(addErrorSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        context: jasmine.objectContaining({ framework: 'nextjs', nextjs: { digest: 'abc123' } }),
      })
    )
  })

  it('omits nextjs key when digest is undefined', () => {
    const { addErrorSpy } = initializeNextjsPlugin()
    const error = new Error('client error')

    addNextjsError(error)

    expect(addErrorSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        context: { framework: 'nextjs' },
      })
    )
  })

  it('omits componentStack when errorInfo is missing', () => {
    const { addErrorSpy } = initializeNextjsPlugin()
    const error = new Error('client error')

    addNextjsError(error)

    expect(addErrorSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        componentStack: undefined,
      })
    )
  })

  it('does not let error.dd_context overwrite framework', () => {
    const { addErrorSpy } = initializeNextjsPlugin()
    const error = Object.assign(new Error('test error'), { dd_context: { framework: 'from-dd-context' } })

    addNextjsError(error, {})

    expect(addErrorSpy.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({
        context: jasmine.objectContaining({ framework: 'nextjs' }),
      })
    )
  })
})