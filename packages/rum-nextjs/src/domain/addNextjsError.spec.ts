import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { nextjsPlugin, resetNextjsPlugin } from './nextjsPlugin'
import { addNextjsError } from './addNextjsError'

const INIT_CONFIGURATION = {} as RumInitConfiguration

function initPluginWithAddErrorSpy() {
  const addErrorSpy = jasmine.createSpy('addError')
  const publicApi = { startView: jasmine.createSpy(), addError: addErrorSpy } as unknown as RumPublicApi
  const plugin = nextjsPlugin()
  plugin.onInit({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })
  return { addErrorSpy }
}

describe('addNextjsError', () => {
  beforeEach(() => {
    registerCleanupTask(() => {
      resetNextjsPlugin()
    })
  })

  it('does nothing when the plugin is not initialized', () => {
    expect(() => addNextjsError(new Error('test'))).not.toThrow()
  })

  it('delegates to publicApi.addError with the error', () => {
    const { addErrorSpy } = initPluginWithAddErrorSpy()
    const error = new Error('test error')

    addNextjsError(error)

    expect(addErrorSpy).toHaveBeenCalledOnceWith(error, { framework: 'nextjs' })
  })

  it('passes user context through', () => {
    const { addErrorSpy } = initPluginWithAddErrorSpy()
    const error = new Error('test error')

    addNextjsError(error, { foo: 'bar' })

    expect(addErrorSpy).toHaveBeenCalledOnceWith(error, { framework: 'nextjs', foo: 'bar' })
  })

  it('adds nextjs.digest context when error.digest is present', () => {
    const { addErrorSpy } = initPluginWithAddErrorSpy()
    const error = Object.assign(new Error('server error'), { digest: 'abc123' })

    addNextjsError(error)

    expect(addErrorSpy).toHaveBeenCalledOnceWith(error, { framework: 'nextjs', nextjs: { digest: 'abc123' } })
  })

  it('omits nextjs key when digest is undefined', () => {
    const { addErrorSpy } = initPluginWithAddErrorSpy()
    const error = new Error('client error')

    addNextjsError(error)

    expect(addErrorSpy).toHaveBeenCalledOnceWith(error, { framework: 'nextjs' })
  })

  it('merges user context with digest context', () => {
    const { addErrorSpy } = initPluginWithAddErrorSpy()
    const error = Object.assign(new Error('server error'), { digest: 'xyz789' })

    addNextjsError(error, { customKey: 'customValue' })

    expect(addErrorSpy).toHaveBeenCalledOnceWith(error, {
      framework: 'nextjs',
      customKey: 'customValue',
      nextjs: { digest: 'xyz789' },
    })
  })
})
