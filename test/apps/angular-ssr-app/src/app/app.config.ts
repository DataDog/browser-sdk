import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { provideClientHydration } from '@angular/platform-browser'
import { provideDatadogErrorHandler, provideDatadogRouter } from '@datadog/browser-rum-angular'
import { routes } from './app.routes'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(),
    provideDatadogRouter(),
    provideDatadogErrorHandler(),
  ],
}
