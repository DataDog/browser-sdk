import { display } from '@datadog/browser-core'
import type { RouteLocationMatched } from 'vue-router'
import { onVueInit } from '../vuePlugin'

export function startVueRouterView(matched: RouteLocationMatched[]) {
  onVueInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the vue plugin configuration, the view will not be tracked.')
      return
    }
    rumPublicApi.startView(computeViewName(matched))
  })
}

export function computeViewName(matched: RouteLocationMatched[]): string {
  if (!matched || matched.length === 0) {
    return ''
  }

  let viewName = '/'

  for (const routeRecord of matched) {
    const path = routeRecord.path
    if (!path) {
      continue
    }

    if (path.startsWith('/')) {
      viewName = path
    } else {
      if (!viewName.endsWith('/')) {
        viewName += '/'
      }
      viewName += path
    }
  }

  return viewName
}
