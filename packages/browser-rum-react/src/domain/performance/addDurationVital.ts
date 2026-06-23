import type { RumPublicApi } from '@openobserve/browser-rum-core'
import { onRumInit } from '../reactPlugin'

export const addDurationVital: RumPublicApi['addDurationVital'] = (name, options) => {
  onRumInit((_, rumPublicApi) => {
    rumPublicApi.addDurationVital(name, options)
  })
}
