import { globalObject } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../browser-core/test'
import { appendElement } from '../../../browser-rum-core/test'
import {
  nextjsPlugin,
  startNextjsView,
  setNextjsViewName,
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
  const startViewSpy = jasmine.createSpy('startView')
  const setViewNameSpy = jasmine.createSpy('setViewName')
  return {
    publicApi: { startView: startViewSpy, setViewName: setViewNameSpy } as unknown as RumPublicApi,
    startViewSpy,
    setViewNameSpy,
  }
}

function initPlugin() {
  const { publicApi, startViewSpy, setViewNameSpy } = createPublicApi()
  const plugin = nextjsPlugin()
  plugin.onInit({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })
  return { plugin, publicApi, startViewSpy, setViewNameSpy }
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
      jasmine.objectContaining({
        name: 'nextjs',
        onInit: jasmine.any(Function),
        onRumStart: jasmine.any(Function),
        getConfigurationTelemetry: jasmine.any(Function),
      })
    )
  })

  it('sets trackViewsManually to true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    const { publicApi } = createPublicApi()

    nextjsPlugin().onInit({ publicApi, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('starts the initial app-router view on init', () => {
    const { startViewSpy } = initPlugin()

    expect(startViewSpy).toHaveBeenCalledOnceWith({ name: window.location.pathname, url: window.location.href })
  })

  it('delegates startNextjsView to publicApi.startView with name', () => {
    const { startViewSpy } = initPlugin()
    startViewSpy.calls.reset()

    startNextjsView('/about')

    expect(startViewSpy).toHaveBeenCalledOnceWith({ name: '/about', url: undefined })
  })

  it('starts a view from onRouterTransitionStart before React renders', () => {
    const { startViewSpy } = initPlugin()
    startViewSpy.calls.reset()

    onRouterTransitionStart('/about?foo=bar')

    expect(startViewSpy).toHaveBeenCalledOnceWith({
      name: '/about',
      url: `${window.location.origin}/about?foo=bar`,
    })
  })

  it('does not start a view for query-string or hash-only navigations', () => {
    const { startViewSpy } = initPlugin()
    startViewSpy.calls.reset()

    onRouterTransitionStart(`${window.location.pathname}?foo=bar`)
    onRouterTransitionStart(`${window.location.pathname}#section`)

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('does not start a view for external navigations', () => {
    const { startViewSpy } = initPlugin()
    startViewSpy.calls.reset()

    onRouterTransitionStart('https://example.com/about')

    expect(startViewSpy).not.toHaveBeenCalled()
  })

  it('sets the normalized name after the view has started', () => {
    const { setViewNameSpy } = initPlugin()

    setNextjsViewName('/users/[id]')
    setNextjsViewName('/users/[id]')

    expect(setViewNameSpy).toHaveBeenCalledOnceWith('/users/[id]')
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
      const callbackSpy = jasmine.createSpy()
      const { publicApi } = createPublicApi()
      onRumInit(callbackSpy)

      expect(callbackSpy).not.toHaveBeenCalled()

      nextjsPlugin().onInit({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      })

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.calls.mostRecent().args[0]).toBe(publicApi)
    })

    it('calls onRumInit subscriber immediately if already initialized', () => {
      const callbackSpy = jasmine.createSpy()
      const { publicApi } = createPublicApi()

      nextjsPlugin().onInit({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      })

      onRumInit(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.calls.mostRecent().args[0]).toBe(publicApi)
    })

    it('calls onRumStart subscribers during onRumStart', () => {
      const callbackSpy = jasmine.createSpy()
      const mockAddError = jasmine.createSpy()
      onRumStart(callbackSpy)

      const { plugin } = initPlugin()
      plugin.onRumStart({ addError: mockAddError })

      expect(callbackSpy).toHaveBeenCalledWith(mockAddError)
    })

    it('calls onRumStart subscriber immediately if already started', () => {
      const mockAddError = jasmine.createSpy()
      const { plugin } = initPlugin()
      plugin.onRumStart({ addError: mockAddError })

      const callbackSpy = jasmine.createSpy()
      onRumStart(callbackSpy)

      expect(callbackSpy).toHaveBeenCalledWith(mockAddError)
    })
  })
})
