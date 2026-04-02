import type { Router } from 'vue-router'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../core/test'
import { nuxtRumPlugin, resetNuxtPlugin } from './nuxtPlugin'

const PUBLIC_API = { startView: jasmine.createSpy() } as unknown as RumPublicApi
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

  it('sets trackViewsManually to true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }

    nuxtRumPlugin(makeRouter()).onInit({ publicApi: PUBLIC_API, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('returns configuration telemetry', () => {
    expect(nuxtRumPlugin(makeRouter()).getConfigurationTelemetry()).toEqual({ router: true, nuxt: true })
  })
})
