import { createRouter as originalCreateRouter } from 'vue-router'
import type { RouterOptions, Router } from 'vue-router'
import { startVueRouterView } from './startVueRouterView'

/**
 * Use this function in place of `vue-router` `createRouter`. Every time a route is
 * rendered, a new RUM view is created.
 *
 * @see https://router.vuejs.org/api/interfaces/RouterOptions.html
 */
export function createRouter(options: RouterOptions): Router {
  const router = originalCreateRouter(options)

  // afterEach fires for the initial navigation when the app is mounted via app.use(router).
  // In tests without mounting, an explicit router.push() is needed to trigger the hook.
  // Skip any failed navigation (blocked by a guard, cancelled, duplicated, etc.).
  // Skip query-only changes (to.path stays the same): those don't constitute a new view,
  // consistent with how the SDK's automatic view tracking ignores query string changes.
  // from.matched.length === 0 identifies the initial START_LOCATION so the first
  // navigation is always tracked, even when the app starts at '/'.
  router.afterEach((to, from, failure) => {
    if (failure) {
      return
    }
    if (from.matched.length > 0 && to.path === from.path) {
      return
    }
    startVueRouterView(to.matched, to.path)
  })

  return router
}
