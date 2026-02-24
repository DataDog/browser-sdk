import { display } from '@datadog/browser-core'
import { onRumInit } from '../reactPlugin'

export function startNextjsView(viewName: string) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.nextAppRouter) {
      display.warn(
        '`nextAppRouter: true` is missing from the react plugin configuration, the view will not be tracked.'
      )
      return
    }
    rumPublicApi.startView(viewName)
  })
}
