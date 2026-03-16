// Client component that throws on button click. The test clicks [data-testid="trigger-error"]
// to trigger the error, which is then caught by the sibling error.tsx boundary.
'use client'

import { useState } from 'react'

export function ClientErrorThrower() {
  const [shouldThrow, setShouldThrow] = useState(false)

  if (shouldThrow) {
    throw new Error('Client error from error-test')
  }

  return (
    <button data-testid="trigger-error" onClick={() => setShouldThrow(true)}>
      Trigger Error
    </button>
  )
}