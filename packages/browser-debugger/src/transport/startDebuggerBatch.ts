import type { InitConfiguration, Batch } from '@datadog/browser-core'
import { createBatch } from '@datadog/browser-core'
import { createEndpointBuilder } from '@datadog/js-core/transport'
import { display } from '../domain/display'

export function startDebuggerBatch(initConfiguration: InitConfiguration): Batch {
  const debuggerEndpointBuilder = createEndpointBuilder({ ...initConfiguration, source: 'dd_debugger' }, 'debugger')

  return createBatch({
    endpoints: [debuggerEndpointBuilder],
    reportError: (message) => display.error('transport error:', message),
  })
}
