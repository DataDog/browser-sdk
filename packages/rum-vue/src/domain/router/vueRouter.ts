import { createRouter as originalCreateRouter } from 'vue-router'
import type { RouterOptions, Router } from 'vue-router'
import { startVueRouterView } from './startVueRouterView'

export function createRouter(options: RouterOptions): Router {
  const router = originalCreateRouter(options)

  // afterEach fires for the initial navigation when the app is mounted via app.use(router).
  // In tests without mounting, an explicit router.push() is needed to trigger the hook.
  // Skip any failed navigation (blocked by a guard, cancelled, duplicated, etc.).
  router.afterEach((to, _from, failure) => {
    if (failure) {
      return
    }
    startVueRouterView(to.matched)
  })

  return router
}
