import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../browser-core/test'
import {
  nextjsPlugin,
  startNextjsView,
  onRumInit,
  onRumStart,
  onRouterTransitionStart,
  resetNextjsPlugin,
} from './nextjsPlugin'

const INIT_CONFIGURATION = {} as RumInitConfiguration

function createPublicApi() {
  const startViewSpy = vi.fn()
  return { publicApi: { startView: startViewSpy } as unknown as RumPublicApi, startViewSpy }
}

function initPlugin() {
  const { publicApi, startViewSpy } = createPublicApi()
  const plugin = nextjsPlugin()
  plugin.onInit({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })
  return { plugin, publicApi, startViewSpy }
}

describe('nextjsPlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => {
      resetNextjsPlugin()
    })
  })

  it('returns a plugin object', () => {
    const plugin = nextjsPlugin()

    expect(plugin).toEqual(
      expect.objectContaining({
        name: 'nextjs',
        onInit: expect.any(Function),
        onRumStart: expect.any(Function),
      })
    )
  })

  it('sets trackViewsManually to true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    const { publicApi } = createPublicApi()

    nextjsPlugin().onInit({ publicApi, initConfiguration })

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

  describe('lifecycle subscribers', () => {
    it('calls onRumInit subscribers during onInit', () => {
      const callbackSpy = vi.fn()
      const { publicApi } = createPublicApi()
      onRumInit(callbackSpy)

      expect(callbackSpy).not.toHaveBeenCalled()

      nextjsPlugin().onInit({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      })

      expect(callbackSpy).toHaveBeenCalledTimes(1)
      expect(callbackSpy.mock.lastCall![0]).toBe(publicApi)
    })

    it('calls onRumInit subscriber immediately if already initialized', () => {
      const callbackSpy = vi.fn()
      const { publicApi } = createPublicApi()

      nextjsPlugin().onInit({
        publicApi,
        initConfiguration: INIT_CONFIGURATION,
      })

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
