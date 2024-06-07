import type { RumPublicApi } from '../boot/rumPublicApi'
import type { RumInitConfiguration } from './configuration'
import type { RumPlugin } from './plugins'
import { callHook } from './plugins'

describe('callHook', () => {
  it('calls the hook on each plugin', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy() } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy() } satisfies RumPlugin
    const parameter = { initConfiguration: {} as RumInitConfiguration, publicApi: {} as RumPublicApi }
    callHook([plugin1, plugin2], 'onInit', parameter)
    expect(plugin1.onInit).toHaveBeenCalledWith(parameter)
    expect(plugin2.onInit).toHaveBeenCalledWith(parameter)
  })

  it('does not call the hook if the plugin does not have it', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy() } satisfies RumPlugin
    const plugin2 = { name: 'b' } satisfies RumPlugin
    const parameter = { initConfiguration: {} as RumInitConfiguration, publicApi: {} as RumPublicApi }
    callHook([plugin1, plugin2], 'onInit', parameter)
    expect(plugin1.onInit).toHaveBeenCalledWith(parameter)
  })
})
