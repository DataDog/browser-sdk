import { Pipeline } from '@datadog/browser-core-next'
import type { LogsEvents } from './logsPipelineEvents'

export function createLogsPipeline(): Pipeline<LogsEvents> {
  return new Pipeline<LogsEvents>()
}
