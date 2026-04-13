import type { Router, RouteLocationMatched } from 'vue-router'
import type { RumPublicApi } from '@datadog/browser-rum-core'

const TERMINAL_CATCH_ALL_PARAM = '(.*)*'
const NESTED_CATCH_ALL_PARAM = '([^/]*)*'
const NORMALIZE_NUXT_PATH_REGEXP = /\\(.)|:([\w.]+)(\(\.\*\)\*|\(\[\^\/\]\*\)\*|\?|\(\))?/g

export function startTrackingNuxtViews(rumPublicApi: RumPublicApi, router: Router) {
  // When tracking starts after the initial navigation already resolved, emit the first view immediately.
  if (router.currentRoute.value.matched.length > 0) {
    rumPublicApi.startView(computeNuxtViewName(router.currentRoute.value.matched))
  }

  router.afterEach((to, from, failure) => {
    if (failure) {
      return
    }
    // START_LOCATION has no matched records, so let the first real navigation create the initial view.
    if (from.matched.length > 0 && to.path === from.path && to.hash === from.hash) {
      return
    }
    rumPublicApi.startView(computeNuxtViewName(to.matched))
  })
}

export function computeNuxtViewName(matched: RouteLocationMatched[]): string {
  const viewName = computeViewName(matched)
  if (!viewName) {
    return viewName
  }

  return normalizeNuxtPath(viewName)
}

function computeViewName(matched: RouteLocationMatched[]): string {
  for (let index = matched.length - 1; index >= 0; index--) {
    const path = matched[index].path
    if (path) {
      return path
    }
  }

  return ''
}

// Nuxt generates Vue Router paths with parameter syntax (for example `:id()`, `:slug?`,
// `:slug(.*)*`). Convert the normalized Vue Router path back to Nuxt's file-based syntax.
function normalizeNuxtPath(path: string): string {
  return path.replace(
    NORMALIZE_NUXT_PATH_REGEXP,
    (_match: string, escapedChar?: string, paramName?: string, suffix?: string): string => {
      if (escapedChar !== undefined) {
        return escapedChar
      }
      if (!paramName) {
        return ''
      }
      if (suffix === TERMINAL_CATCH_ALL_PARAM || suffix === NESTED_CATCH_ALL_PARAM) {
        return `[...${paramName}]`
      }
      if (suffix === '?') {
        return `[[${paramName}]]`
      }
      return `[${paramName}]`
    }
  )
}
