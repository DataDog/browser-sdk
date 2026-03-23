import { display } from '@datadog/browser-core'
import { onRumInit } from '../angularPlugin'
import type { RouteSnapshot } from './types'

const PRIMARY_OUTLET = 'primary'

export function startAngularView(root: RouteSnapshot, url: string) {
  onRumInit((configuration, rumPublicApi) => {
    if (!configuration.router) {
      display.warn('`router: true` is missing from the react plugin configuration, the view will not be tracked.')
      return
    }

    const viewName = computeViewName(root)

    rumPublicApi.startView({ name: viewName, url })
  })
}

export function computeViewName(root: RouteSnapshot): string {
  const segments: string[] = []
  let current: RouteSnapshot | undefined = root

  while (current) {
    const path = current.routeConfig?.path

    if (path === '**') {
      for (const segment of current.url) {
        segments.push(segment.path)
      }
      break
    }

    if (path) {
      segments.push(path)
    }

    // Follow primary outlet only — named outlets (e.g. sidebar) are excluded
    current = current.children.find((child) => child.outlet === PRIMARY_OUTLET)
  }

  return `/${segments.join('/')}`
}
