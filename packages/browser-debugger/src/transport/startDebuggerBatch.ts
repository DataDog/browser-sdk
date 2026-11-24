import type { InitConfiguration, Batch } from '@datadog/browser-core'
import { createBatch } from '@datadog/browser-core'
import { createEndpointBuilder } from '@datadog/js-core/transport'
import { display } from '../domain/display'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export function startDebuggerBatch(initConfiguration: InitConfiguration): Batch {
  const debuggerEndpointBuilder = createEndpointBuilder(
    { ...initConfiguration, source: 'dd_debugger' },
    'debugger',
    __BUILD_ENV__SDK_VERSION__
  )

  return createBatch({
    endpoints: [debuggerEndpointBuilder],
    reportError: (message) => display.error('transport error:', message),
  })
}
