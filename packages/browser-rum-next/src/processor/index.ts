import type { Module, ModuleContext } from '@datadog/core-next'
import { rumExtension } from '../domain/configuration'

interface RumPublicApi extends Record<string, unknown> {
  addError(error: Error | string, context?: object): void
  getInternalContext(): Record<string, unknown>
}

const rumProcessor: Module = {
  name: 'rum',
  extension: rumExtension,
  init(_context: ModuleContext): RumPublicApi {
    return {
      addError() {},
      getInternalContext() {
        return {}
      },
    }
  },
}

export { rumProcessor }
export type { RumPublicApi }
