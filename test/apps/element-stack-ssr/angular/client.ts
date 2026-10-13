import '@angular/compiler'
import { bootstrapApplication, provideClientHydration } from '@angular/platform-browser'
import { App } from './app'

void bootstrapApplication(App, { providers: [provideClientHydration()] })
