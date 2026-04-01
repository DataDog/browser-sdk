import { ErrorBoundary } from '@datadog/browser-rum-nextjs'
import type { ErrorBoundaryFallback } from '@datadog/browser-rum-nextjs'
import { useState, useEffect } from 'react'
import Link from 'next/link'

function ErrorThrower() {
  const [shouldThrow, setShouldThrow] = useState(false)
  if (shouldThrow) throw new Error('Pages Router error from NextjsErrorBoundary')
  return (
    <button data-testid="trigger-error" onClick={() => setShouldThrow(true)}>
      Trigger Error
    </button>
  )
}

const ErrorFallback: ErrorBoundaryFallback = ({ error, resetError }) => {
  const [errorReported, setErrorReported] = useState(false)

  useEffect(() => {
    setErrorReported(true)
  }, [error])

  return (
    <div data-testid="error-boundary" data-error-reported={errorReported || undefined}>
      <p>{error.message}</p>
      <button data-testid="reset-error" onClick={resetError}>
        Reset
      </button>
    </div>
  )
}

export default function ErrorTestPage() {
  return (
    <div>
      <Link href="/pages-router">← Back to Home</Link>
      <h1>Error Test</h1>
      <ErrorBoundary fallback={ErrorFallback}>
        <ErrorThrower />
      </ErrorBoundary>
    </div>
  )
}
