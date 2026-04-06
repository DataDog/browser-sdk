import type { Pipeline, RuntimeErrorResource } from '@datadog/core-next'

function startRuntimeErrorCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const handleError = (event: ErrorEvent) => {
    const error = event.error as Error | undefined
    const resource: RuntimeErrorResource = {
      message: error?.message ?? event.message ?? 'Unknown error',
      stack: error?.stack,
      type: error?.name,
      source: 'source',
    }
    pipeline.publish('resource:runtime_error', resource)
  }

  const handleRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason
    const error = reason instanceof Error ? reason : undefined
    const resource: RuntimeErrorResource = {
      message: error?.message ?? String(reason),
      stack: error?.stack,
      type: error?.name ?? 'Unhandled Rejection',
      source: 'source',
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
