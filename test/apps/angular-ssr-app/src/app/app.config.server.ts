import {
  inject,
  mergeApplicationConfig,
  ApplicationConfig,
  PlatformRef,
  provideEnvironmentInitializer,
} from '@angular/core'
import { provideServerRendering, withRoutes } from '@angular/ssr'
import { appConfig } from './app.config'
import { serverRoutes } from './app.routes.server'
import { trackRender } from '../ssr-leak-probe'

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    // Angular creates one platform per render: it holds the request document and everything rendered
    provideEnvironmentInitializer(() => trackRender(inject(PlatformRef))),
  ],
}

export const config = mergeApplicationConfig(appConfig, serverConfig)
