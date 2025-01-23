import type { RumPublicApi } from '@datadog/browser-rum-core'
import { onReactPluginInit } from '../reactPlugin'

export const addDurationVital: RumPublicApi['addDurationVital'] = (name, options) => {
  onReactPluginInit((_, rumPublicApi) => {
    rumPublicApi.addDurationVital(name, options)
  })
}
