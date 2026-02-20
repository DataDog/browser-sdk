'use client'

import { useState } from 'react'
import Link from 'next/link'

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
        <h3>Error Boundary (Next.js error.tsx)</h3>
        <ComponentWithErrorButton />
      </section>

      <section>
        <h3>Other Error Types</h3>
        <button onClick={() => throwAsyncError()}>Async Error</button>
        <button onClick={throwUnhandledRejection}>Unhandled Rejection</button>
      </section>
    </div>
  )
}
