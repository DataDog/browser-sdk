import type { Router, RouteLocationMatched } from 'vue-router'
import type { RumPublicApi } from '@datadog/browser-rum-core'

export function startTrackingNuxtViews(rumPublicApi: RumPublicApi, router: Router) {
  if (router.currentRoute.value.matched.length > 0) {
    rumPublicApi.startView(computeNuxtViewName(router.currentRoute.value.matched))
  }

  router.afterEach((to, from, failure) => {
    if (failure) {
      return
    }
    if (from.matched.length > 0 && to.path === from.path && to.hash === from.hash) {
      return
    }
    rumPublicApi.startView(computeNuxtViewName(to.matched))
  })
}

export function computeNuxtViewName(matched: RouteLocationMatched[]): string {
  let name = computeViewName(matched)
  // Transform catch-all params: :slug(.*)*  -> [...slug]
  name = name.replace(/\/:([^(/]+)\([^)]*\)\*/g, '/[...$1]')
  // Transform simple params: :id or :id() -> [id]
  name = name.replace(/\/:([^(/[]+)(?:\([^)]*\))?/g, '/[$1]')
  return name
}

function computeViewName(matched: RouteLocationMatched[]): string {
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
