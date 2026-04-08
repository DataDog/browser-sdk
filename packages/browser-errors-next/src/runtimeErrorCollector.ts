import type { Pipeline, RuntimeErrorResource, ErrorCause } from '@datadog/core-next'

function flattenCauses(error: Error): ErrorCause[] | undefined {
  if (!('cause' in error)) return undefined

  const causes: ErrorCause[] = []
  let current: unknown = (error as any).cause
  while (current instanceof Error) {
    causes.push({ message: current.message, type: current.name, stack: current.stack })
    current = (current as any).cause
  }

  return causes.length > 0 ? causes : undefined
}

function extractFingerprint(error: Error | undefined): string | undefined {
  if (!error) return undefined
  return 'dd_fingerprint' in error ? String((error as any).dd_fingerprint) : undefined
}

function startRuntimeErrorCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  const handleError = (event: ErrorEvent) => {
    const error = event.error as Error | undefined
    const resource: RuntimeErrorResource = {
      message: error?.message ?? event.message ?? 'Unknown error',
      stack: error?.stack,
      type: error?.name,
      source: 'source',
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
      stack: error?.stack,
      type: error?.name ?? 'Unhandled Rejection',
      source: 'source',
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
