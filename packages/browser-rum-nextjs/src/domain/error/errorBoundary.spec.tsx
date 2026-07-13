import { vi, describe, it, expect } from 'vitest'
import React from 'react'

import { disableUncaughtExceptionTracking, ignoreConsoleLogs } from '@datadog/browser-core/test'
import { appendComponent } from '../../../../browser-rum-react/test/appendComponent'
import { initReactOldBrowsersSupport } from '../../../../browser-rum-react/test/reactOldBrowsersSupport'
import { initializeNextjsPlugin } from '../../../test/initializeNextjsPlugin'
import { ErrorBoundary } from './errorBoundary'

// Component behavior (renders children, fallback, resetError) is tested via createErrorBoundary
// in packages/browser-rum-react/src/domain/error/errorBoundary.spec.tsx

describe('NextjsErrorBoundary', () => {
  it('reports the error through addNextjsError', () => {
    ignoreConsoleLogs('error', 'Error: error')
    disableUncaughtExceptionTracking()
    initReactOldBrowsersSupport()

    const addErrorSpy = vi.fn()
    initializeNextjsPlugin({ addError: addErrorSpy })
    const originalError = new Error('error')
    const ComponentSpy = vi.fn().mockImplementation(() => {
      throw originalError
    })
    ;(ComponentSpy as any).displayName = 'ComponentSpy'

    appendComponent(
      <ErrorBoundary fallback={() => null}>
        <ComponentSpy />
      </ErrorBoundary>
    )

    expect(addErrorSpy).toHaveBeenCalledTimes(1)
    expect(addErrorSpy).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        error: originalError,
        handlingStack: expect.any(String),
        startClocks: expect.any(Object),
        context: expect.objectContaining({
          framework: 'nextjs',
        }),
        componentStack: expect.stringContaining('ComponentSpy'),
      })
    )
  })
})
