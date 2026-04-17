import { display } from '@datadog/browser-core'
import { onRumInit } from '../svelteKitPlugin'
import type { NavigationTarget } from './types'

export function startSvelteKitRouterView(to: NavigationTarget) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the sveltekit plugin configuration, the view will not be tracked.')
      return
    }
    rumPublicApi.startView(computeViewName(to))
  })
}

export function computeViewName(to: NavigationTarget): string {
  // SvelteKit's route.id is the parameterized route pattern mirroring the filesystem and
  // preserves bracket syntax ([slug], [[lang]], [...rest], [p=matcher]) and route groups '(app)'.
  // It is already the collapsed view name we want. Fall back to the URL pathname when route.id
  // is null (no route matched, e.g. 404).
  return to.route.id ?? to.url.pathname
}
