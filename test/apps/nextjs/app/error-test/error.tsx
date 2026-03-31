// Segment-level error boundary for the error-test route (https://nextjs.org/docs/app/api-reference/file-conventions/error).
// Calls addNextjsError to report both client errors and server errors (with digest) to RUM.
'use client'

import { addNextjsError } from '@datadog/browser-rum-nextjs'
import Link from 'next/link'
import { useEffect } from 'react'

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    addNextjsError(error)
  }, [error])

  return (
    <div data-testid="error-handled">
      <h2>Something went wrong!</h2>
      {error.digest && <p data-testid="error-digest">Digest: {error.digest}</p>}
      <button onClick={reset}>Try again</button>
      <br />
      <Link href="/">Back to Home</Link>
    </div>
  )
}
