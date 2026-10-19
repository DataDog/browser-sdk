import { register } from '@shopify/web-pixels-extension'
import { display } from '@datadog/browser-core'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { makeRumPublicApi } from '@datadog/browser-rum-core'
import { makeRecorderApiStub, makeProfilerApiStub } from '@datadog/browser-rum-slim/internal'
import { shopifyAppPixelPlugin } from '../domain/shopifyAppPixelPlugin'

register((api) => {
  let initConfiguration: RumInitConfiguration
  try {
    if (typeof api.settings.rumConfig !== 'string') {
      throw new Error('Missing rumConfig')
    }
    initConfiguration = JSON.parse(api.settings.rumConfig)
    if (!initConfiguration || typeof initConfiguration !== 'object' || Array.isArray(initConfiguration)) {
      throw new Error('Invalid rumConfig')
    }
  } catch {
    display.error('Shopify settings.rumConfig must contain a JSON object')
    return
  }

  const datadogRum = makeRumPublicApi(makeRecorderApiStub(), makeProfilerApiStub(), {
    sdkName: 'rum-shopify',
    allowWorker: true,
  })
  // // @ts-expect-error - _setDebug is not typed
  // datadogRum._setDebug(true)
  datadogRum.init({ ...initConfiguration, plugins: [shopifyAppPixelPlugin(api)] })
})
