import type { Router } from 'vue-router'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { nuxtRumPlugin, onRumStart, resetNuxtPlugin } from './nuxtPlugin'

const PUBLIC_API = {} as RumPublicApi
const INIT_CONFIGURATION = {} as RumInitConfiguration

function makeRouter(): Router {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] })
}

describe('nuxtRumPlugin', () => {
  beforeEach(() => {
    registerCleanupTask(() => resetNuxtPlugin())
  })

  it('returns a plugin object with name "nuxt"', () => {
    expect(nuxtRumPlugin(makeRouter())).toEqual(jasmine.objectContaining({ name: 'nuxt' }))
  })

  it('calls callbacks registered with onRumStart during onRumStart', () => {
    const addError = jasmine.createSpy()
    const spy = jasmine.createSpy()
    onRumStart(spy)

    nuxtRumPlugin(makeRouter()).onRumStart({ addError })

    expect(spy).toHaveBeenCalledOnceWith(addError)
  })

  it('calls callbacks immediately if onRumStart was already invoked', () => {
    const addError = jasmine.createSpy()
    const spy = jasmine.createSpy()

    nuxtRumPlugin(makeRouter()).onRumStart({ addError })
    onRumStart(spy)

    expect(spy).toHaveBeenCalledOnceWith(addError)
  })

  it('sets trackViewsManually to true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }

    nuxtRumPlugin(makeRouter()).onInit({ publicApi: PUBLIC_API, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('returns configuration telemetry', () => {
    expect(nuxtRumPlugin(makeRouter()).getConfigurationTelemetry()).toEqual({ router: true, nuxt: true })
  })
})
