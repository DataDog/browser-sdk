// Angular packages are partially compiled and the tests don't run the Angular linker
import '@angular/compiler'
import type { ApplicationRef, EnvironmentProviders, Provider } from '@angular/core'
import { provideZonelessChangeDetection } from '@angular/core'
import { createApplication } from '@angular/platform-browser'
import { registerCleanupTask } from '../../browser-core/test'

// A real application, so `providedIn: 'root'` tokens resolve (they don't with `createEnvironmentInjector()`)
export async function createTestApplication(
  providers: Array<Provider | EnvironmentProviders>
): Promise<ApplicationRef> {
  const applicationRef = await createApplication({ providers: [provideZonelessChangeDetection(), providers] })
  registerCleanupTask(() => {
    applicationRef.destroy()
  })
  return applicationRef
}
