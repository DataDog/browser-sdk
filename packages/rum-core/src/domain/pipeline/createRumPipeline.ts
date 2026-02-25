import { Pipeline } from '@datadog/browser-core-next'
import type { RumCoreEvents } from './rumPipelineEvents'

export function createRumPipeline(): Pipeline<RumCoreEvents> {
  return new Pipeline<RumCoreEvents>()
}
