// Values passed from the Vitest config (`test.provide`) to the browser (`inject()`)
import 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    failOnUnexpectedConsoleCalls: boolean
  }
}
