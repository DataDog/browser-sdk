import { describe, expect, it } from 'vitest'
import type { RumInitConfiguration, RumPluginOnInitOptions } from '@datadog/browser-rum-core'
import { shopifyAppPixelPlugin } from './shopifyAppPixelPlugin'

describe('shopifyAppPixelPlugin', () => {
  it('forces the worker configuration', () => {
    const initConfiguration = {
      trackUserInteractions: true,
      sessionPersistence: 'cookie',
    } as unknown as RumInitConfiguration

    void shopifyAppPixelPlugin().onInit!({ initConfiguration } as RumPluginOnInitOptions)

    expect(initConfiguration).toEqual(
      expect.objectContaining({
        trackViewsManually: true,
        trackUserInteractions: false,
        trackResources: false,
        trackLongTasks: false,
        trackViewMetricsManually: true,
        sessionReplaySampleRate: 0,
        profilingSampleRate: 0,
        sessionPersistence: 'memory',
      })
    )
  })
})
