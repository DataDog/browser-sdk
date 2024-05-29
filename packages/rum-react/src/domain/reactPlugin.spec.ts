import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { onReactPluginInit, reactPlugin, resetReactPlugin } from './reactPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('reactPlugin', () => {
  afterEach(() => {
    resetReactPlugin()
  })

  it('returns a plugin object', () => {
    const plugin = reactPlugin()
    expect(plugin).toEqual(
      jasmine.objectContaining({
        name: 'react',
        onInit: jasmine.any(Function),
      })
    )
  })

  it('calls callbacks registered with onReactPluginInit during onInit', () => {
    const callbackSpy = jasmine.createSpy()
    const pluginConfiguration = {}
    onReactPluginInit(callbackSpy)

    expect(callbackSpy).not.toHaveBeenCalled()

    reactPlugin(pluginConfiguration).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
    expect(callbackSpy.calls.mostRecent().args[1]).toBe(PUBLIC_API)
  })

  it('calls callbacks immediately if onInit was already invoked', () => {
    const callbackSpy = jasmine.createSpy()
    const pluginConfiguration = {}
    reactPlugin(pluginConfiguration).onInit({ publicApi: PUBLIC_API, initConfiguration: INIT_CONFIGURATION })

    onReactPluginInit(callbackSpy)

    expect(callbackSpy).toHaveBeenCalledTimes(1)
    expect(callbackSpy.calls.mostRecent().args[0]).toBe(pluginConfiguration)
    expect(callbackSpy.calls.mostRecent().args[1]).toBe(PUBLIC_API)
  })
})
