import type { EnvironmentProviders } from '@angular/core'
import { makeEnvironmentProviders, ENVIRONMENT_INITIALIZER, inject, PLATFORM_ID } from '@angular/core'
import { isPlatformBrowser } from '@angular/common'
import { Router, ResolveStart } from '@angular/router'
import type { Observable, Subscription } from 'rxjs'
import { filter } from 'rxjs'
import type { AngularActivatedRouteSnapshot } from './types'
import { startAngularView } from './startAngularView'

export function provideDatadogRouter(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useFactory: () => {
        const platformId = inject(PLATFORM_ID)
        if (!isPlatformBrowser(platformId)) {
          return () => {
            /* no-op on server */
          }
        }
        const router = inject(Router)
        return () => {
          trackRouterViews(router.events.pipe(filter((e): e is ResolveStart => e instanceof ResolveStart)))
        }
      },
    },
  ])
}

export interface ResolveStartLike {
  urlAfterRedirects: string
  state: {
    root: AngularActivatedRouteSnapshot
  }
}

/**
 * Subscribe to ResolveStart events and start RUM views.
 * Exported for testing without Angular DI.
 */
export function trackRouterViews(resolveStartEvents: Observable<ResolveStartLike>): Subscription {
  let lastPath: string | undefined

  return resolveStartEvents.subscribe((event) => {
    const path = extractPath(event.urlAfterRedirects)
    if (lastPath !== undefined && path === lastPath) {
      return
    }
    lastPath = path

    // Traverse to the deepest activated route
    let route: AngularActivatedRouteSnapshot = event.state.root
    while (route.firstChild) {
      route = route.firstChild
    }

    startAngularView(route.pathFromRoot, path)
  })
}

function extractPath(url: string): string {
  return url.split('?')[0].split('#')[0]
}
