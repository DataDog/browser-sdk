import { VERSION } from '@angular/core'
import { display, toMajorVersionIntegration } from '@datadog/browser-core'
import type { RumInitConfiguration, RumPluginOnInitOptions, RumPublicApi } from '@datadog/browser-rum-core'
import { collectAsyncCalls, mockClock, registerCleanupTask } from '../../../browser-core/test'
import { addAngularErrorWhenReady, angularPlugin, resetAngularPlugin, startAngularViewWhenReady } from './angularPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration
const ERROR_PAYLOAD = { error: new Error('foo') } as Parameters<typeof addAngularErrorWhenReady>[0]

// The plugin's buffers replay in a microtask, after which values are forwarded right away
function flushMicrotasks() {
  return new Promise<void>((resolve) => queueMicrotask(resolve))
}

describe('angularPlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => {
      resetAngularPlugin()
    })
  })

  it('returns a plugin object', () => {
    const plugin = angularPlugin()
    expect(plugin).toEqual(
      jasmine.objectContaining({
        name: 'angular',
        onInit: jasmine.any(Function),
        onRumStart: jasmine.any(Function),
      })
    )
  })

  function initPlugin(startView: jasmine.Spy, configuration = { router: true }) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises -- onInit never returns a promise for this plugin
    angularPlugin(configuration).onInit!({
      publicApi: PUBLIC_API,
      initConfiguration: { ...INIT_CONFIGURATION },
      startView,
    } as unknown as RumPluginOnInitOptions)
  }

  it('starts the views reported before onInit, at the time they happened', async () => {
    const clock = mockClock()
    const startView = jasmine.createSpy()
    clock.tick(10)
    startAngularViewWhenReady({ name: '/foo', url: '/foo' })
    clock.tick(10)
    startAngularViewWhenReady({ name: '/bar', url: '/bar' })
    clock.tick(10)

    initPlugin(startView)

    expect((await collectAsyncCalls(startView, 2)).allArgs()).toEqual([
      [
        { name: '/foo', url: '/foo' },
        { relative: clock.relative(10), timeStamp: clock.timeStamp(10) },
      ],
      [
        { name: '/bar', url: '/bar' },
        { relative: clock.relative(20), timeStamp: clock.timeStamp(20) },
      ],
    ])
  })

  it('starts views right away once onInit was called', async () => {
    const clock = mockClock()
    const startView = jasmine.createSpy()
    initPlugin(startView)
    await flushMicrotasks()
    clock.tick(10)

    startAngularViewWhenReady({ name: '/foo', url: '/foo' })

    expect(startView).toHaveBeenCalledOnceWith(
      { name: '/foo', url: '/foo' },
      { relative: clock.relative(10), timeStamp: clock.timeStamp(10) }
    )
  })

  it('warns instead of starting views when router is not enabled', async () => {
    const displayWarnSpy = spyOn(display, 'warn')
    const startView = jasmine.createSpy()
    startAngularViewWhenReady({ name: '/foo', url: '/foo' })

    initPlugin(startView, { router: false })

    await collectAsyncCalls(displayWarnSpy, 1)
    expect(startView).not.toHaveBeenCalled()
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

  it('adds errors reported before onRumStart when onRumStart is called', async () => {
    const addError = jasmine.createSpy()
    addAngularErrorWhenReady(ERROR_PAYLOAD)
    expect(addError).not.toHaveBeenCalled()

    angularPlugin().onRumStart!({ addError })

    expect((await collectAsyncCalls(addError, 1)).argsFor(0)).toEqual([ERROR_PAYLOAD])
  })

  it('keeps the 500 latest errors reported before onRumStart', async () => {
    const addError = jasmine.createSpy()
    for (let i = 0; i < 501; i++) {
      addAngularErrorWhenReady({ ...ERROR_PAYLOAD, context: { i } })
    }

    angularPlugin().onRumStart!({ addError })

    const calls = await collectAsyncCalls(addError, 500)
    expect(calls.first().args[0].context).toEqual({ i: 1 })
  })

  it('adds errors right away once onRumStart was called', async () => {
    const addError = jasmine.createSpy()
    angularPlugin().onRumStart!({ addError })
    await flushMicrotasks()

    addAngularErrorWhenReady(ERROR_PAYLOAD)

    expect(addError).toHaveBeenCalledOnceWith(ERROR_PAYLOAD)
  })
})
