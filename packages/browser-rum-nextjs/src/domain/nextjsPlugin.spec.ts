import { vi, describe, it, expect, beforeEach } from 'vitest'
import { globalObject } from '@datadog/js-core/util'
import type { RumInitConfiguration, RumPublicApi, RumPluginOnInitOptions } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../browser-core/test'
import { appendElement } from '../../../browser-rum-core/test'
import {
  nextjsPlugin,
  startNextjsView,
  onRumInit,
  onRumStart,
  onRouterTransitionStart,
  resetNextjsPlugin,
} from './nextjsPlugin'

const INIT_CONFIGURATION = {} as RumInitConfiguration

interface NextjsGlobalObject {
  next?: { version?: string }
}

function createPublicApi() {
  const startViewSpy = vi.fn()
  return { publicApi: { startView: startViewSpy } as unknown as RumPublicApi, startViewSpy }
}

function initPlugin() {
  const { publicApi, startViewSpy } = createPublicApi()
  const plugin = nextjsPlugin()
  // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
  plugin.onInit({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } } as RumPluginOnInitOptions)
  return { plugin, publicApi, startViewSpy }
}

describe('nextjsPlugin', () => {
  beforeEach(() => {
    const nextjsGlobalObject = globalObject as NextjsGlobalObject
    const originalNext = nextjsGlobalObject.next
    nextjsGlobalObject.next = { version: '16.2.0' }

    registerCleanupTask(() => {
      resetNextjsPlugin()
      nextjsGlobalObject.next = originalNext
    })
  })

  it('returns a plugin object', () => {
    const plugin = nextjsPlugin()

    expect(plugin).toEqual(
      expect.objectContaining({
        name: 'nextjs',
        onInit: expect.any(Function),
        onRumStart: expect.any(Function),
        getConfigurationTelemetry: expect.any(Function),
      })
    )
  })

  it('sets trackViewsManually to true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    const { publicApi } = createPublicApi()

    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    nextjsPlugin().onInit({ publicApi, initConfiguration } as RumPluginOnInitOptions)

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not start a view on init', () => {
    const { startViewSpy } = initPlugin()

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('delegates startNextjsView to publicApi.startView with name', () => {
    const { startViewSpy } = initPlugin()

    startNextjsView('/about')

    expect(startViewSpy).toHaveBeenCalledTimes(1)
    expect(startViewSpy).toHaveBeenCalledWith({ name: '/about', url: undefined })
  })

  it('uses onRouterTransitionStart URL when available', () => {
    const { startViewSpy } = initPlugin()

    onRouterTransitionStart('/about?foo=bar')
    startNextjsView('/about')

    expect(startViewSpy).toHaveBeenCalledTimes(1)
    expect(startViewSpy).toHaveBeenCalledWith({
      name: '/about',
      url: `${window.location.origin}/about?foo=bar`,
    })
  })

  it('clears onRouterTransitionStart URL after startNextjsView consumes it', () => {
    const { startViewSpy } = initPlugin()

    onRouterTransitionStart('/about')
    startNextjsView('/about')
    startNextjsView('/other')

    expect(startViewSpy.mock.lastCall![0]).toEqual({ name: '/other', url: undefined })
  })

  it('reports app-router when no __NEXT_DATA__ script is present', () => {
    const { plugin } = initPlugin()

    expect(plugin.getConfigurationTelemetry()).toEqual({
      router: true,
      integrations: ['nextjs-v16', 'app-router'],
    })
  })

  it('reports pages-router when a __NEXT_DATA__ script is present', () => {
    appendElement('<script id="__NEXT_DATA__"></script>')

    const { plugin } = initPlugin()

    expect(plugin.getConfigurationTelemetry()).toEqual({
      router: true,
      integrations: ['nextjs-v16', 'pages-router'],
    })
  })

  it('does not return the router integration before onInit is called', () => {
    const plugin = nextjsPlugin()

    expect(plugin.getConfigurationTelemetry()).toEqual({ router: true, integrations: ['nextjs-v16'] })
  })

  describe('lifecycle subscribers', () => {
    it('calls onRumInit subscribers during onInit', () => {
      const callbackSpy = vi.fn()
      const { publicApi } = createPublicApi()
      onRumInit(callbackSpy)

      expect(callbackSpy).not.toHaveBeenCalled()

      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
      nextjsPlugin().onInit({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      } as RumPluginOnInitOptions)

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.mock.lastCall![0]).toBe(publicApi)
    })

    it('calls onRumInit subscriber immediately if already initialized', () => {
      const callbackSpy = vi.fn()
      const { publicApi } = createPublicApi()

      // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
      nextjsPlugin().onInit({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      } as RumPluginOnInitOptions)

      onRumInit(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.mock.lastCall![0]).toBe(publicApi)
    })

    it('calls onRumStart subscribers during onRumStart', () => {
      const callbackSpy = vi.fn()
      const mockAddError = vi.fn()
      onRumStart(callbackSpy)

      const { plugin } = initPlugin()
      plugin.onRumStart({ addError: mockAddError })

      expect(callbackSpy).toHaveBeenCalledWith(mockAddError)
    })

    it('calls onRumStart subscriber immediately if already started', () => {
      const mockAddError = vi.fn()
      const { plugin } = initPlugin()
      plugin.onRumStart({ addError: mockAddError })

      const callbackSpy = vi.fn()
      onRumStart(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledWith(mockAddError)
    })
  })
})
