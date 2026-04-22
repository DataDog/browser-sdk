import type { Pipeline } from '@datadog/core-next'

function startCollectors(_pipeline: Pipeline<Record<string, unknown>>): () => void {
  return () => {}
}

export { startCollectors }
