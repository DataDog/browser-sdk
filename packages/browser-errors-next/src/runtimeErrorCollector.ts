import type { Pipeline, RuntimeErrorResource } from '@datadog/core-next'
import { flattenCauses, extractFingerprint } from '@datadog/core-next'

function startRuntimeErrorCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const handleError = (event: ErrorEvent) => {
    const error = event.error as Error | undefined
    const resource: RuntimeErrorResource = {
      message: error?.message ?? event.message ?? 'Unknown error',
      type: error?.name,
      source: 'source',
      error,
      fingerprint: extractFingerprint(error),
      causes: error ? flattenCauses(error) : undefined,
    }
    pipeline.publish('resource:runtime_error', resource)
  }

  const handleRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    const error = reason instanceof Error ? reason : undefined
    const resource: RuntimeErrorResource = {
      message: error?.message ?? String(reason),
      type: error?.name ?? 'Unhandled Rejection',
      source: 'source',
      error,
      fingerprint: extractFingerprint(error),
      causes: error ? flattenCauses(error) : undefined,
    }
    pipeline.publish('resource:runtime_error', resource)
  }

  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleRejection)

  return () => {
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleRejection)
  }
}

export { startRuntimeErrorCollection }
