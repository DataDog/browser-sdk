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
