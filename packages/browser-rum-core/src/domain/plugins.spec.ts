import { createSessionManagerMock } from '@datadog/browser-core/test'
import type { RumInitConfiguration } from './configuration'
import type { RumPluginOnInitOptions, RumPlugin } from './plugins'
import { callPluginsOnInit, callPluginsOnRumStart } from './plugins'

describe('callPluginsOnInit', () => {
  const PARAMETER = { initConfiguration: {}, publicApi: {} } as RumPluginOnInitOptions

  it('calls onInit on each plugin', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy() } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy() } satisfies RumPlugin

    void callPluginsOnInit([plugin1, plugin2], PARAMETER)

    expect(plugin1.onInit).toHaveBeenCalledWith(PARAMETER)
    expect(plugin2.onInit).toHaveBeenCalledWith(PARAMETER)
  })

  it('does not call onInit if the plugin does not have it', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy() } satisfies RumPlugin
    const plugin2 = { name: 'b' } satisfies RumPlugin

    expect(() => callPluginsOnInit([plugin1, plugin2], PARAMETER)).not.toThrow()
    expect(plugin1.onInit).toHaveBeenCalledWith(PARAMETER)
  })

  it('returns true synchronously when there are no plugins', () => {
    expect(callPluginsOnInit(undefined, PARAMETER)).toBe(true)
  })

  it('returns true synchronously when every plugin returns void or true', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy().and.returnValue(undefined) } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy().and.returnValue(true) } satisfies RumPlugin

    const result = callPluginsOnInit([plugin1, plugin2], PARAMETER)

    expect(result).toBe(true)
    expect(plugin1.onInit).toHaveBeenCalledWith(PARAMETER)
    expect(plugin2.onInit).toHaveBeenCalledWith(PARAMETER)
  })

  it('returns false synchronously as soon as a sync plugin returns false, but still calls the other plugins', () => {
    const plugin1 = { name: 'a', onInit: jasmine.createSpy().and.returnValue(false) } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy() } satisfies RumPlugin

    const result = callPluginsOnInit([plugin1, plugin2], PARAMETER)

    expect(result).toBe(false)
    expect(plugin2.onInit).toHaveBeenCalledWith(PARAMETER)
  })

  it('returns a Promise once a plugin returns a thenable, and resolves to true if nothing aborts', async () => {
    const plugin1 = { name: 'a', onInit: () => Promise.resolve() } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy().and.returnValue(true) } satisfies RumPlugin

    const result = callPluginsOnInit([plugin1, plugin2], PARAMETER)

    expect(result).not.toBe(true)
    expect(await result).toBe(true)
    expect(plugin2.onInit).toHaveBeenCalledWith(PARAMETER)
  })

  it('resolves to false once an async plugin resolves to false, without waiting for it before calling other plugins', async () => {
    const plugin1 = { name: 'a', onInit: () => Promise.resolve(false) } satisfies RumPlugin
    const plugin2 = { name: 'b', onInit: jasmine.createSpy() } satisfies RumPlugin

    const result = callPluginsOnInit([plugin1, plugin2], PARAMETER)

    expect(plugin2.onInit).toHaveBeenCalledWith(PARAMETER)
    expect(await result).toBe(false)
  })

  it('does not wait for an earlier plugin to resolve before calling the next plugin', async () => {
    let clientTokenSeenByPlugin2: string | undefined
    const plugin1 = {
      name: 'a',
      onInit: ({ initConfiguration }: { initConfiguration: RumInitConfiguration }) =>
        Promise.resolve().then(() => {
          initConfiguration.clientToken = 'from-async-plugin'
        }),
    } satisfies RumPlugin
    const plugin2 = {
      name: 'b',
      onInit: ({ initConfiguration }: { initConfiguration: RumInitConfiguration }) => {
        clientTokenSeenByPlugin2 = initConfiguration.clientToken
      },
    } satisfies RumPlugin
    const initConfiguration = {} as RumInitConfiguration

    await callPluginsOnInit([plugin1, plugin2], { initConfiguration, publicApi: {} } as RumPluginOnInitOptions)

    expect(clientTokenSeenByPlugin2).toBeUndefined()
  })
})

describe('callPluginsOnRumStart', () => {
  function createStartRumResult() {
    return { addEvent: jasmine.createSpy(), addError: jasmine.createSpy(), sessionManager: createSessionManagerMock() }
  }

  it('calls onRumStart on each plugin', () => {
    const plugin1 = { name: 'a', onRumStart: jasmine.createSpy() } satisfies RumPlugin
    const plugin2 = { name: 'b', onRumStart: jasmine.createSpy() } satisfies RumPlugin
    const startRumResult = createStartRumResult()

    callPluginsOnRumStart([plugin1, plugin2], startRumResult)

    const expectedOptions = jasmine.objectContaining({
      addEvent: startRumResult.addEvent,
      addError: startRumResult.addError,
    })
    expect(plugin1.onRumStart).toHaveBeenCalledWith(expectedOptions)
    expect(plugin2.onRumStart).toHaveBeenCalledWith(expectedOptions)
  })

  it('gives plugins only the read-only methods of the session manager', () => {
    const plugin = { name: 'a', onRumStart: jasmine.createSpy() } satisfies RumPlugin
    const startRumResult = createStartRumResult()

    callPluginsOnRumStart([plugin], startRumResult)

    expect(plugin.onRumStart.calls.mostRecent().args[0].sessionManager).toEqual({
      findSession: startRumResult.sessionManager.findSession,
      findTrackedSession: startRumResult.sessionManager.findTrackedSession,
    })
  })

  it('does not call onRumStart if the plugin does not have it', () => {
    const plugin1 = { name: 'a', onRumStart: jasmine.createSpy() } satisfies RumPlugin
    const plugin2 = { name: 'b' } satisfies RumPlugin
    const startRumResult = createStartRumResult()

    expect(() => callPluginsOnRumStart([plugin1, plugin2], startRumResult)).not.toThrow()
    expect(plugin1.onRumStart).toHaveBeenCalledWith(
      jasmine.objectContaining({ addEvent: startRumResult.addEvent, addError: startRumResult.addError })
    )
  })

  it('does nothing when there are no plugins', () => {
    expect(() => callPluginsOnRumStart(undefined, createStartRumResult())).not.toThrow()
  })
})
