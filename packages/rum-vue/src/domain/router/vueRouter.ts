import { createRouter as originalCreateRouter, isNavigationFailure, NavigationFailureType } from 'vue-router'
import type { RouterOptions, Router } from 'vue-router'
import { startVueRouterView } from './startVueRouterView'

export function createRouter(options: RouterOptions): Router {
  const router = originalCreateRouter(options)

  // afterEach fires for the initial navigation when the app is mounted via app.use(router).
  // In tests without mounting, an explicit router.push() is needed to trigger the hook.
  router.afterEach((to, _from, failure) => {
    if (failure && !isNavigationFailure(failure, NavigationFailureType.duplicated)) {
      return
    }
    startVueRouterView(to.matched)
  })

  return router
}
