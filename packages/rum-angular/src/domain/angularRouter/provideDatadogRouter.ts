import { ENVIRONMENT_INITIALIZER, PLATFORM_ID, inject } from '@angular/core'
import type { Provider } from '@angular/core'
import { isPlatformBrowser } from '@angular/common'
import { EventType, Router } from '@angular/router'
import type { ResolveStart } from '@angular/router'
import { startAngularRouterView } from './startAngularView'
import type { AngularActivatedRouteSnapshot } from './types'

/**
 * Minimal shape of the Angular `Router` service that the tracking function consumes.
 * Using this internal type lets us test `startAngularRouterTracking` without spinning
 * up an Angular DI container.
 */
interface RouterEventsEmitter {
  events: {
    subscribe: (observer: (event: unknown) => void) => unknown
  }
}

/**
 * Returns the providers needed to enable Datadog RUM view tracking for Angular Router.
 *
 * Add this alongside your `provideRouter` call in `bootstrapApplication` (or in a module's
 * providers list). It installs an `ENVIRONMENT_INITIALIZER` that subscribes to the Router's
 * `ResolveStart` events and calls `startView` on the RUM public API for each committed
 * navigation.
 *
 * The subscription is skipped during server-side rendering (no browser platform).
 */
export function provideDatadogRouter(): Provider[] {
  return [
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: initializeDatadogRouterTracking,
    },
  ]
}

function initializeDatadogRouterTracking() {
  // On the server (@angular/ssr), window is unavailable and a fresh ResolveStart
  // will fire again during client hydration — avoid subscribing twice.
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return
  }
  startAngularRouterTracking(inject(Router))
}

/**
 * Subscribes to a Router's events and triggers a RUM view start for each committed
 * `ResolveStart`. Exported for testing — production code should use `provideDatadogRouter()`.
 *
 * ResolveStart is chosen over NavigationEnd so that resolver fetches and initial
 * component render work are attributed to the new view rather than the previous one.
 * Supersession can still cancel a navigation after this point; the next navigation's
 * ResolveStart supersedes it.
 */
export function startAngularRouterTracking(router: RouterEventsEmitter) {
  router.events.subscribe((event) => {
    if (isResolveStart(event)) {
      const root = event.state.root as unknown as AngularActivatedRouteSnapshot
      startAngularRouterView(root, event.urlAfterRedirects)
    }
  })
}

function isResolveStart(event: unknown): event is ResolveStart {
  return typeof event === 'object' && event !== null && (event as { type?: unknown }).type === EventType.ResolveStart
}
