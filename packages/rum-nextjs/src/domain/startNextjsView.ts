import { onRumInit } from './nextjsPlugin'

export function startNextjsView(viewName: string) {
  onRumInit((_configuration, publicApi) => {
    publicApi.startView(viewName)
  })
}
