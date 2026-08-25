import type { RumPublicApi } from '../boot/rumPublicApi'
import type { RumInitConfiguration } from './configuration'
import type { RumPlugin } from './plugins'
import { callPluginsMethod } from './plugins'

describe('callPluginsMethod', () => {
  it('calls the method on each plugin', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy() } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy() } satisfies RumPlugin
    const parameter = { initConfiguration: {} as RumInitConfiguration, publicApi: {} as RumPublicApi }
    void callPluginsMethod([plugin1, plugin2], 'onInit', parameter)
    expect(plugin1.onInit).toHaveBeenCalledWith(parameter)
    expect(plugin2.onInit).toHaveBeenCalledWith(parameter)
  })

  it('does not call the method if the plugin does not have it', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy() } satisfies RumPlugin
    const plugin2 = { name: 'b' } satisfies RumPlugin
    const parameter = { initConfiguration: {} as RumInitConfiguration, publicApi: {} as RumPublicApi }
    void callPluginsMethod([plugin1, plugin2], 'onInit', parameter)
    expect(plugin1.onInit).toHaveBeenCalledWith(parameter)
  })
})

describe('works with sync and async plugins onInit', () => {
  const PARAMETER = { initConfiguration: {} as RumInitConfiguration, publicApi: {} as RumPublicApi }

  it('returns true synchronously when there are no plugins', () => {
    expect(callPluginsMethod(undefined, 'onInit', PARAMETER)).toBe(true)
  })

  it('returns true synchronously when every plugin returns void or true', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy().and.returnValue(undefined) } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy().and.returnValue(true) } satisfies RumPlugin

    const result = callPluginsMethod([plugin1, plugin2], 'onInit', PARAMETER)

    expect(result).toBe(true)
    expect(plugin1.onInit).toHaveBeenCalledWith(PARAMETER)
    expect(plugin2.onInit).toHaveBeenCalledWith(PARAMETER)
  })

  it('returns false synchronously as soon as a sync plugin returns false, without calling the rest', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy().and.returnValue(false) } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy() } satisfies RumPlugin

    const result = callPluginsMethod([plugin1, plugin2], 'onInit', PARAMETER)

    expect(result).toBe(false)
    expect(plugin2.onInit).not.toHaveBeenCalled()
  })

  it('returns a Promise once a plugin returns a thenable, and resolves to true if nothing aborts', async () => {
    const plugin1 = { name: 'a', onInit: () => Promise.resolve() } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy().and.returnValue(true) } satisfies RumPlugin

    const result = callPluginsMethod([plugin1, plugin2], 'onInit', PARAMETER)

    expect(result).not.toBe(true)
    expect(await result).toBe(true)
    expect(plugin2.onInit).toHaveBeenCalledWith(PARAMETER)
  })

  it('resolves to false and stops calling further plugins once an async plugin resolves to false', async () => {
    const plugin1 = { name: 'a', onInit: () => Promise.resolve(false) } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy() } satisfies RumPlugin

    const result = callPluginsMethod([plugin1, plugin2], 'onInit', PARAMETER)

    expect(await result).toBe(false)
    expect(plugin2.onInit).not.toHaveBeenCalled()
  })

  it('lets a sync plugin see mutations made by an earlier async plugin', async () => {
    const plugin1: RumPlugin = {
      name: 'a',
      onInit: ({ initConfiguration }) => {
        initConfiguration.clientToken = 'from-async-plugin'
        return Promise.resolve()
      },
    }
    const plugin2: RumPlugin = {
      name: 'b',
      onInit: ({ initConfiguration }) => {
        expect(initConfiguration.clientToken).toBe('from-async-plugin')
      },
    }

    await callPluginsMethod([plugin1, plugin2], 'onInit', PARAMETER)
  })
})
