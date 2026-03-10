import { NextjsErrorBoundary } from '@datadog/browser-rum-nextjs'
import type { NextjsErrorBoundaryFallback } from '@datadog/browser-rum-nextjs'
import { useState } from 'react'
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

const ErrorFallback: NextjsErrorBoundaryFallback = ({ error, resetError }) => (
  <div data-testid="error-boundary">
    <p>{error.message}</p>
    <button data-testid="reset-error" onClick={resetError}>
      Reset
    </button>
  </div>
)

export default function ErrorTestPage() {
  return (
    <div>
      <Link href="/pages-router">← Back to Home</Link>
      <h1>Error Test</h1>
      <NextjsErrorBoundary fallback={ErrorFallback}>
        <ErrorThrower />
      </NextjsErrorBoundary>
    </div>
  )
}
