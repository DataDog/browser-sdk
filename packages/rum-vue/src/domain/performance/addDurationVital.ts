import type { RumPublicApi } from '@datadog/browser-rum-core'
import { onRumInit } from '../vuePlugin'

export const addDurationVital: RumPublicApi['addDurationVital'] = (name, options) => {
  onRumInit((_, rumPublicApi) => {
    rumPublicApi.addDurationVital(name, options)
  })
}
