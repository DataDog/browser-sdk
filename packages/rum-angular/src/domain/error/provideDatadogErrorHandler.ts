import type { EnvironmentProviders } from '@angular/core'
// eslint-disable-next-line local-rules/disallow-side-effects
import { ErrorHandler, makeEnvironmentProviders } from '@angular/core'
import { addAngularError } from './addAngularError'

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
  return makeEnvironmentProviders([{ provide: ErrorHandler, useClass: DatadogErrorHandler }])
}
