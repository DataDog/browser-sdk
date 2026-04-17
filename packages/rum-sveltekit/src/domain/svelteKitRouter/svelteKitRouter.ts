import type { Navigation } from './types'
import { startSvelteKitRouterView } from './startSvelteKitView'

// afterNavigate fires on the initial page load (type === 'enter', from === null) AND after every
// subsequent client-side navigation. navigation.to is guaranteed non-null here and carries the
// final post-redirect route. Skip query-only changes (pathname unchanged) to stay consistent with
// the SDK's default view tracking which ignores query strings.
export function trackSvelteKitNavigation(navigation: Navigation) {
  const to = navigation.to
  if (!to) {
    return
  }
  const from = navigation.from
  if (from && from.url.pathname === to.url.pathname) {
    return
  }
  startSvelteKitRouterView(to)
}
