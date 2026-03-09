import { createRouter as originalCreateRouter } from 'vue-router'
import type { RouterOptions, Router } from 'vue-router'
import { startVueRouterView } from './startVueRouterView'

export function createRouter(options: RouterOptions): Router {
  const router = originalCreateRouter(options)

  router.afterEach((to) => {
    startVueRouterView(to.matched)
  })

  return router
}
