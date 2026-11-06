import type { EnvironmentProviders } from '@angular/core'
import { ENVIRONMENT_INITIALIZER, InjectionToken, inject, makeEnvironmentProviders } from '@angular/core'
import { GuardsCheckEnd, Router } from '@angular/router'
import { filter } from 'rxjs'
import { noop } from '@datadog/js-core/util'
import { startAngularView } from './startAngularView'

// Replaced by `provideNoopDatadogRouter()`
// eslint-disable-next-line local-rules/disallow-side-effects
const DATADOG_ROUTER_INITIALIZER = new InjectionToken<() => void>('DatadogRouterInitializer')

/**
 * Angular provider that subscribes to Router events and starts a new RUM view
 * on each GuardsCheckEnd, using the matched route template as the view name.
 *
 * GuardsCheckEnd fires after guards pass but before resolvers run, so data
 * fetches from resolvers are correctly attributed to the new view.
 *
 * With server-side rendering, add `provideNoopDatadogRouter()` to the server application config.
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
      provide: DATADOG_ROUTER_INITIALIZER,
      useFactory: () => {
        const router = inject(Router)

        return () => {
          let currentPath: string | undefined

          // No unsubscribe needed as its for the full app lifecycle and because DestroyRef requires v16+
          router.events
            .pipe(filter((event): event is GuardsCheckEnd => event instanceof GuardsCheckEnd))
            .subscribe((event) => {
              if (!event.shouldActivate) {
                return
              }

              const url = event.urlAfterRedirects
              const path = url.replace(/[?#].*$/, '')

              if (path === currentPath) {
                return
              }
              currentPath = path

              const root = event.state.root
              startAngularView(root, url)
            })
        }
      },
    },
    // Needed for Angular v15 support (provideEnvironmentInitializer requires v16+)
    { provide: ENVIRONMENT_INITIALIZER, multi: true, useExisting: DATADOG_ROUTER_INITIALIZER },
  ])
}

/**
 * Disables `provideDatadogRouter()`. Add it to the server application config, where RUM never
 * starts and tracked views would accumulate in memory.
 *
 * @category Main
 * @example
 * ```ts
 * // app.config.server.ts
 * import { ApplicationConfig, mergeApplicationConfig } from '@angular/core'
 * import { provideServerRendering } from '@angular/ssr'
 * import { provideNoopDatadogRouter } from '@datadog/browser-rum-angular'
 * import { appConfig } from './app.config'
 *
 * const serverConfig: ApplicationConfig = {
 *   providers: [provideServerRendering(), provideNoopDatadogRouter()],
 * }
 *
 * export const config = mergeApplicationConfig(appConfig, serverConfig)
 * ```
 */
export function provideNoopDatadogRouter(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: DATADOG_ROUTER_INITIALIZER, useValue: noop }])
}
