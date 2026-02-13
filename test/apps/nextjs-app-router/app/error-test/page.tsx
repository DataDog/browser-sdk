'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ErrorBoundary } from '@datadog/browser-rum-react'

function ComponentWithErrorButton() {
  const [shouldError, setShouldError] = useState(false)

  if (shouldError) {
    throw new Error('Error triggered by button click')
  }

  return (
    <div>
      <h2>Click button to trigger error</h2>
      <button id="error-button" onClick={() => setShouldError(true)}>
        Trigger Error
      </button>
    </div>
  )
}

export default function ErrorTestPage() {
  const throwAsyncError = async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
    throw new Error('Test asynchronous error')
  }

  const throwUnhandledRejection = () => {
    Promise.reject(new Error('Test unhandled promise rejection'))
  }

  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>Error Testing</h1>

      <section>
        <h3>Error Boundary (Datadog RUM)</h3>
        <ErrorBoundary
          fallback={({ error, resetError }) => (
            <div>
              <h3>Something went wrong</h3>
              <p>{error.message}</p>
              <button onClick={resetError}>Try again</button>
            </div>
          )}
        >
          <ComponentWithErrorButton />
        </ErrorBoundary>
      </section>

      <section>
        <h3>Other Error Types</h3>
        <button onClick={() => throwAsyncError()}>Async Error</button>
        <button onClick={throwUnhandledRejection}>Unhandled Rejection</button>
      </section>
    </div>
  )
}
