'use client'

import { addNextjsError } from '@datadog/browser-rum-nextjs'
import Link from 'next/link'
import { useEffect } from 'react'

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    addNextjsError(error)
  }, [error])

  return (
    <div data-testid="error-boundary">
      <h2>Something went wrong!</h2>
      {error.digest && <p data-testid="error-digest">Digest: {error.digest}</p>}
      <button onClick={reset}>Try again</button>
      <br />
      <Link href="/">Go to Home</Link>
    </div>
  )
}
