// Error test page. Triggers a client-side error
// and verifies it is captured by error.tsx via addNextjsError.
'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ErrorTestPage() {
  const [shouldThrow, setShouldThrow] = useState(false)

  if (shouldThrow) {
    throw new Error('Client error from error-test')
  }

  return (
    <div>
      <Link href="/">← Back to Home</Link>
      <h1>Error Test</h1>
      <button data-testid="trigger-error" onClick={() => setShouldThrow(true)}>
        Trigger Error
      </button>
    </div>
  )
}
