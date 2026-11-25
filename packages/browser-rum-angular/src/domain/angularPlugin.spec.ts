import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VERSION } from '@angular/core'
import { display, toMajorVersionIntegration } from '@datadog/browser-core'
import type {
  RumInitConfiguration,
  RumPluginOnInitOptions,
  RumPublicApi,
  StartRumResult,
} from '@datadog/browser-rum-core'
import { registerCleanupTask, waitNextMicrotask } from '../../../browser-core/test'
import { addAngularErrorWhenReady, angularPlugin, resetAngularPlugin, startAngularViewWhenReady } from './angularPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('angularPlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => {
      resetAngularPlugin()
    })
  })

  it('returns a plugin object', () => {
    const plugin = angularPlugin()
    expect(plugin).toEqual(
      expect.objectContaining({
        name: 'angular',
        onInit: expect.any(Function),
        onRumStart: expect.any(Function),
      })
    )
  })

  function callOnInit(configuration = { router: true }, startViewSpy = vi.fn()) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    angularPlugin(configuration).onInit!({
      publicApi: { startView: startViewSpy } as unknown as RumPublicApi,
      initConfiguration: { ...INIT_CONFIGURATION },
    } as RumPluginOnInitOptions)
    return startViewSpy
  }

  function fakeError(id: number) {
    return { error: id } as unknown as Parameters<NonNullable<StartRumResult['addError']>>[0]
  }

  it('starts views queued before onInit, in order', async () => {
    startAngularViewWhenReady({ name: '/a', url: '/a' })
    startAngularViewWhenReady({ name: '/b', url: '/b' })

    const startViewSpy = callOnInit()
    await waitNextMicrotask()

    expect(startViewSpy.mock.calls).toEqual([[{ name: '/a', url: '/a' }], [{ name: '/b', url: '/b' }]])
  })

  it('starts views immediately after onInit', async () => {
    const startViewSpy = callOnInit()
    await waitNextMicrotask()

    startAngularViewWhenReady({ name: '/a', url: '/a' })

    expect(startViewSpy).toHaveBeenCalledExactlyOnceWith({ name: '/a', url: '/a' })
  })

  it('starts each view once when onInit runs several times', async () => {
    const startViewSpy = callOnInit()
    callOnInit(undefined, startViewSpy)
    await waitNextMicrotask()

    startAngularViewWhenReady({ name: '/a', url: '/a' })

    expect(startViewSpy).toHaveBeenCalledExactlyOnceWith({ name: '/a', url: '/a' })
  })

  it('does not start views and warns when router is disabled', async () => {
    const warnSpy = vi.spyOn(display, 'warn').mockReturnValue(undefined)
    startAngularViewWhenReady({ name: '/a', url: '/a' })

    const startViewSpy = callOnInit({ router: false })
    await waitNextMicrotask()

    expect(startViewSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
      '`router: true` is missing from the angular plugin configuration, the view will not be tracked.'
    )
  })

  it('keeps only the 500 most recent views before onInit', async () => {
    for (let i = 0; i < 501; i++) {
      startAngularViewWhenReady({ name: `/${i}` })
    }

    const startViewSpy = callOnInit()
    await waitNextMicrotask()

    expect(startViewSpy).toHaveBeenCalledTimes(500)
    expect(startViewSpy.mock.calls[0][0]).toEqual({ name: '/1' })
  })

  it('adds errors queued before onRumStart, then adds new errors immediately', async () => {
    addAngularErrorWhenReady(fakeError(1))
    const addErrorSpy = vi.fn()

    angularPlugin().onRumStart!({ addError: addErrorSpy })
    await waitNextMicrotask()
    addAngularErrorWhenReady(fakeError(2))

    expect(addErrorSpy.mock.calls).toEqual([[fakeError(1)], [fakeError(2)]])
  })

  it('keeps only the 500 most recent errors before onRumStart', async () => {
    for (let i = 0; i < 501; i++) {
      addAngularErrorWhenReady(fakeError(i))
    }
    const addErrorSpy = vi.fn()

    angularPlugin().onRumStart!({ addError: addErrorSpy })
    await waitNextMicrotask()

    expect(addErrorSpy).toHaveBeenCalledTimes(500)
    expect(addErrorSpy.mock.calls[0][0]).toEqual(fakeError(1))
  })

  it('enforce manual view tracking when router is enabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    angularPlugin({ router: true }).onInit!({ publicApi: PUBLIC_API, initConfiguration } as RumPluginOnInitOptions)

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not enforce manual view tracking when router is disabled', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    angularPlugin({ router: false }).onInit!({ publicApi: PUBLIC_API, initConfiguration } as RumPluginOnInitOptions)

    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns the configuration telemetry', () => {
    const pluginConfiguration = { router: true }
    const plugin = angularPlugin(pluginConfiguration)

    expect(plugin.getConfigurationTelemetry!()).toEqual({
      router: true,
      integrations: [toMajorVersionIntegration('angular', VERSION.major), 'angular-router'],
    })
  })

  it('returns the Angular integration when router tracking is disabled', () => {
    expect(angularPlugin().getConfigurationTelemetry!()).toEqual({
      router: false,
      integrations: [toMajorVersionIntegration('angular', VERSION.major)],
    })
  })
})
