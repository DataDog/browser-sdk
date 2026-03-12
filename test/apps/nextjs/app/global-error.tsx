// Global error boundary — catches errors that escape the root layout (https://nextjs.org/docs/app/getting-started/error-handling#global-errors).
// Calls addNextjsError so tests can verify RUM captures root-level errors.
'use client'

import { addNextjsError } from '@datadog/browser-rum-nextjs'
import { useEffect } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    addNextjsError(error)
  }, [error])

  return (
    <html>
      <body>
        <div data-testid="global-error-boundary">
          <h2>Global error!</h2>
          {error.digest && <p data-testid="error-digest">Digest: {error.digest}</p>}
          <button onClick={reset}>Try again</button>
          <br />
          <a href="/">Go to Home</a>
        </div>
      </body>
    </html>
  )
}
