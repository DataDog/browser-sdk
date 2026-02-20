'use client'

import { useEffect } from 'react'
import { reportNextjsError } from '@datadog/browser-rum-nextjs/app-router'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportNextjsError(error, reset)
  }, [error, reset])

  return (
    <div>
      <h2>Something went wrong!</h2>
      <p id="error-message">{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
