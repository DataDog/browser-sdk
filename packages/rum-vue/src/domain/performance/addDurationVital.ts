import type { RumPublicApi } from '@datadog/browser-rum-core'
import { onVueInit } from '../vuePlugin'

export const addDurationVital: RumPublicApi['addDurationVital'] = (name, options) => {
  onVueInit((_, rumPublicApi) => {
    rumPublicApi.addDurationVital(name, options)
  })
}
