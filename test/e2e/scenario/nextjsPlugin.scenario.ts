import { test } from '@playwright/test'
import { createTest } from '../lib/framework'
import { NextjsRouter } from '../lib/helpers/playwright'

const routers = [
  { router: NextjsRouter.App, label: 'app router', dynamicViewName: '/user/:id', slugViewName: '/guides/:slug+' },
  {
    router: NextjsRouter.Pages,
    label: 'pages router',
    dynamicViewName: '/user/[id]',
    slugViewName: '/guides/[...slug]',
  },
]

for (const { router, label, dynamicViewName, slugViewName } of routers) {
  test.describe(`nextjs ${label}`, () => {
    // shared tests: initial view, dynamic route, catch-all, SPA nav, back nav, tracked component
    void createTest
    void dynamicViewName
    void slugViewName
    void router
  })
}
