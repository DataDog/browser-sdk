import type { Context } from '@datadog/browser-core'
import type { LogsEvent } from '../../logsEvent.types'
import type { AssembledLogAttributes } from './assemblyDecoratorFactory'

/**
 * Converts an enriched observation (after decoration) to the wire format
 * expected by startLogsBatch's `batch.add()`.
 */
export function logsToServerFormat(enriched: AssembledLogAttributes): LogsEvent & Context {
  return enriched.assembledLog
}
