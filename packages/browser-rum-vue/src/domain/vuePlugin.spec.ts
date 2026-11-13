import { version as vueVersion } from 'vue'
import { display, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPluginOnInitOptions, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask, waitNextMicrotask } from '../../../browser-core/test'
import type { VuePluginConfiguration, VueErrorPayload } from './vuePlugin'
import { vuePlugin, resetVuePlugin, startVueViewWhenReady, addVueErrorWhenReady } from './vuePlugin'

const PUBLIC_API = {} as RumPublicApi

function initPlugin(configuration: VuePluginConfiguration, startView = jasmine.createSpy()) {
  // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
  vuePlugin(configuration).onInit({
    publicApi: { startView } as unknown as RumPublicApi,
    initConfiguration: {} as RumInitConfiguration,
  } as RumPluginOnInitOptions)
  return startView
}

function error(message: string) {
  return { error: new Error(message) } as VueErrorPayload
}
const INIT_CONFIGURATION = {} as RumInitConfiguration

describe('vuePlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => resetVuePlugin())
  })

  it('returns a plugin object with name "vue"', () => {
    expect(vuePlugin()).toEqual(jasmine.objectContaining({ name: 'vue' }))
  })

  it('replays views notified before onInit, in order', async () => {
    startVueViewWhenReady('/a')
    startVueViewWhenReady('/b')
    const startView = initPlugin({ router: true })
    await waitNextMicrotask()
    expect(startView.calls.allArgs()).toEqual([['/a'], ['/b']])
  })

  it('starts views notified after onInit', async () => {
    const startView = initPlugin({ router: true })
    await waitNextMicrotask()
    startVueViewWhenReady('/a')
    expect(startView).toHaveBeenCalledOnceWith('/a')
  })

  it('starts each view once when onInit is called several times', async () => {
    initPlugin({ router: true })
    const startView = initPlugin({ router: true })
    await waitNextMicrotask()
    startVueViewWhenReady('/a')
    expect(startView).toHaveBeenCalledOnceWith('/a')
  })

  it('warns and does not start views when router is not enabled', async () => {
    const warnSpy = spyOn(display, 'warn')
    startVueViewWhenReady('/a')
    const startView = initPlugin({})
    await waitNextMicrotask()
    expect(startView).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledOnceWith(
      '`router: true` is missing from the vue plugin configuration, the view will not be tracked.'
    )
  })

  it('keeps only the 500 most recent views before onInit', async () => {
    for (let i = 0; i < 501; i++) {
      startVueViewWhenReady(`/${i}`)
    }
    const startView = initPlugin({ router: true })
    await waitNextMicrotask()
    expect(startView).toHaveBeenCalledTimes(500)
    expect(startView.calls.first().args[0]).toBe('/1')
  })

  it('replays errors notified before onRumStart, then reports new ones', async () => {
    const addError = jasmine.createSpy()
    const first = error('first')
    addVueErrorWhenReady(first)
    vuePlugin().onRumStart({ addError })
    await waitNextMicrotask()
    const second = error('second')
    addVueErrorWhenReady(second)
    expect(addError.calls.allArgs()).toEqual([[first], [second]])
  })

  it('keeps only the 500 most recent errors before onRumStart', async () => {
    for (let i = 0; i < 501; i++) {
      addVueErrorWhenReady(error(String(i)))
    }
    const addError = jasmine.createSpy()
    vuePlugin().onRumStart({ addError })
    await waitNextMicrotask()
    expect(addError).toHaveBeenCalledTimes(500)
  })

  it('sets trackViewsManually when router is true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    vuePlugin({ router: true }).onInit({ publicApi: PUBLIC_API, initConfiguration } as RumPluginOnInitOptions)
    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('does not set trackViewsManually when router is false', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    vuePlugin({ router: false }).onInit({ publicApi: PUBLIC_API, initConfiguration } as RumPluginOnInitOptions)
    expect(initConfiguration.trackViewsManually).toBeUndefined()
  })

  it('returns configuration telemetry', () => {
    expect(vuePlugin({ router: true }).getConfigurationTelemetry()).toEqual({
      router: true,
      integrations: [toMajorVersionIntegration('vue', vueVersion), 'vue-router'],
    })
  })

  it('returns the Vue integration when router tracking is disabled', () => {
    expect(vuePlugin().getConfigurationTelemetry()).toEqual({
      router: false,
      integrations: [toMajorVersionIntegration('vue', vueVersion)],
    })
  })
})
