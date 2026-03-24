import { display } from '@datadog/browser-core'
import type { RouteLocationMatched } from 'vue-router'
import { onRumInit } from '../vuePlugin'

export function startVueRouterView(matched: RouteLocationMatched[]) {
  onRumInit((configuration, rumPublicApi) => {
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

    // Note: Vue Router normalizes all paths in the matched array to absolute paths,
    // so the relative-path branch below is purely defensive and not expected to be
    // hit in practice. It mirrors the React Router implementation for consistency.
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
