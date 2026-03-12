import type { EnvironmentProviders } from '@angular/core'
// eslint-disable-next-line local-rules/disallow-side-effects
import { DestroyRef, ENVIRONMENT_INITIALIZER, inject, makeEnvironmentProviders } from '@angular/core'
// eslint-disable-next-line local-rules/disallow-side-effects
import { GuardsCheckEnd, Router } from '@angular/router'
// eslint-disable-next-line local-rules/disallow-side-effects
import { filter } from 'rxjs'

import { startAngularView } from '../angularPlugin'
import { computeRouteViewName } from './computeRouteViewName'
import type { RouteSnapshot } from './types'

/**
 * Angular provider that subscribes to Router events and starts a new RUM view
 * on each GuardsCheckEnd, using the matched route template as the view name.
 *
 * GuardsCheckEnd fires after guards pass but before resolvers run, so data
 * fetches from resolvers are correctly attributed to the new view.
 *
 * @category Main
 * @example
 * ```ts
 * import { bootstrapApplication } from '@angular/platform-browser'
 * import { provideRouter } from '@angular/router'
 * import { provideDatadogRouter } from '@datadog/browser-rum-angular'
 *
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideRouter(routes),
 *     provideDatadogRouter(),
 *   ],
 * })
 * ```
 */
export function provideDatadogRouter(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useFactory: () => {
        const router = inject(Router)
        const destroyRef = inject(DestroyRef)

        return () => {
          const subscription = router.events
            .pipe(filter((event): event is GuardsCheckEnd => event instanceof GuardsCheckEnd))
            .subscribe((event) => {
              const root = event.state.root as unknown as RouteSnapshot
              const viewName = computeRouteViewName(root)
              startAngularView(viewName)
            })

          destroyRef.onDestroy(() => subscription.unsubscribe())
        }
      },
    },
  ])
}
