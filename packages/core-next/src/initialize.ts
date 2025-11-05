import { display, monitorError } from '@datadog/browser-core'
import { getInternalApi } from '@datadog/browser-internal-next'
import type { CoreInitializeConfiguration } from '@datadog/browser-internal-next'

export function initialize(initializeConfiguration: CoreInitializeConfiguration) {
  const promises = [
    import('./lazy'),
    import('./lazyCompression'),
    initializeConfiguration.rum && import('@datadog/browser-rum-next/lazy'),
    initializeConfiguration.profiling && import('@datadog/browser-profiling-next/lazy'),
    initializeConfiguration.logs && import('@datadog/browser-logs-next/lazy'),
  ] as const

  // eslint-disable-next-line @typescript-eslint/await-thenable
  Promise.all(promises)
    .then(([lazyCoreModule, lazyCompressionModule, rumModule, profilingModule, logsModule]) => {
      const lazyApi = lazyCoreModule.initialize(
        initializeConfiguration,
        lazyCompressionModule.initialize(initializeConfiguration)?.createEncoder
      )
      if (!lazyApi) {
        return
      }

      if (rumModule) {
        rumModule.initialize(lazyApi)
      }

      if (profilingModule) {
        profilingModule.initialize(lazyApi)
      }

      if (logsModule) {
        logsModule.initialize(lazyApi)
      }
    })
    .finally(() => {
      getInternalApi().bus.unbuffer()
    })
    .catch((error) => {
      display.error('Failed to load lazy chunks', error)
      monitorError(error)
    })
}
