import type { Router } from 'vue-router'
import { createRouter, createMemoryHistory } from 'vue-router'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../browser-core/test'
import type { NuxtApp } from './error/setupNuxtErrorHandling'
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
    expect(nuxtRumPlugin({ router: makeRouter() })).toEqual(jasmine.objectContaining({ name: 'nuxt' }))
  })

  it('sets trackViewsManually to true', () => {
    const initConfiguration = { ...INIT_CONFIGURATION }

    nuxtRumPlugin({ router: makeRouter() }).onInit({ publicApi: PUBLIC_API, initConfiguration })

    expect(initConfiguration.trackViewsManually).toBe(true)
  })

  it('returns configuration telemetry', () => {
    const nuxtApp = { versions: { nuxt: '4.2.0' } } as NuxtApp

    expect(nuxtRumPlugin({ router: makeRouter(), nuxtApp }).getConfigurationTelemetry()).toEqual({
      router: true,
      integrations: ['nuxt-v4', 'nuxt-router'],
      nuxt: true,
    })
  })

  it('does not return a Nuxt version when the Nuxt app is not provided', () => {
    expect(nuxtRumPlugin({ router: makeRouter() }).getConfigurationTelemetry()).toEqual({
      router: true,
      integrations: ['nuxt-router'],
      nuxt: true,
    })
  })
})
