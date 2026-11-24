import type { EnvironmentProviders } from '@angular/core'
import { ErrorHandler, InjectionToken, makeEnvironmentProviders } from '@angular/core'
import { addAngularError } from './addAngularError'

// Replaced by `provideNoopDatadogErrorHandler()`
// eslint-disable-next-line local-rules/disallow-side-effects
const DATADOG_ERROR_HANDLER = new InjectionToken<ErrorHandler>('DatadogErrorHandler')

// eslint-disable-next-line no-restricted-syntax
class DatadogErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    addAngularError(error)
    super.handleError(error)
  }
}

/**
 * Provides a Datadog-instrumented Angular ErrorHandler that reports errors to RUM.
 *
 * With server-side rendering, add `provideNoopDatadogErrorHandler()` to the server application config.
 *
 * @category Error
 * @example
 * ```ts
 * import { provideDatadogErrorHandler } from '@datadog/browser-rum-angular'
 *
 * bootstrapApplication(AppComponent, {
 *   providers: [provideDatadogErrorHandler()],
 * })
 * ```
 */
export function provideDatadogErrorHandler(): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: DATADOG_ERROR_HANDLER, useClass: DatadogErrorHandler },
    { provide: ErrorHandler, useExisting: DATADOG_ERROR_HANDLER },
  ])
}

/**
 * Stops `provideDatadogErrorHandler()` from reporting errors to RUM; they are still logged to the
 * console. Add it to the server application config, where RUM never starts and reported errors
 * would accumulate in memory.
 *
 * @category Error
 * @example
 * ```ts
 * // app.config.server.ts
 * import { ApplicationConfig, mergeApplicationConfig } from '@angular/core'
 * import { provideServerRendering } from '@angular/ssr'
 * import { provideNoopDatadogErrorHandler } from '@datadog/browser-rum-angular'
 * import { appConfig } from './app.config'
 *
 * const serverConfig: ApplicationConfig = {
 *   providers: [provideServerRendering(), provideNoopDatadogErrorHandler()],
 * }
 *
 * export const config = mergeApplicationConfig(appConfig, serverConfig)
 * ```
 */
export function provideNoopDatadogErrorHandler(): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: DATADOG_ERROR_HANDLER, useClass: ErrorHandler }])
}
