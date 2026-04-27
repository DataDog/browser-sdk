import React from 'react'

import { disableJasmineUncaughtExceptionTracking, ignoreConsoleLogs } from '@datadog/browser-core/test'
import { appendComponent } from '../../../../rum-react/test/appendComponent'
import { initReactOldBrowsersSupport } from '../../../../rum-react/test/reactOldBrowsersSupport'
import { initializeNextjsPlugin } from '../../../test/initializeNextjsPlugin'
import { ErrorBoundary } from './errorBoundary'

// Component behavior (renders children, fallback, resetError) is tested via createErrorBoundary
// in packages/rum-react/src/domain/error/errorBoundary.spec.tsx

describe('NextjsErrorBoundary', () => {
  it('reports the error through addNextjsError', () => {
    ignoreConsoleLogs('error', 'Error: error')
    disableJasmineUncaughtExceptionTracking()
    initReactOldBrowsersSupport()

    const addErrorSpy = jasmine.createSpy()
    initializeNextjsPlugin({ addError: addErrorSpy })
    const originalError = new Error('error')
    const ComponentSpy = jasmine.createSpy().and.throwError(originalError)
    ;(ComponentSpy as any).displayName = 'ComponentSpy'

    appendComponent(
      <ErrorBoundary fallback={() => null}>
        <ComponentSpy />
      </ErrorBoundary>
    )

    expect(addErrorSpy).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        error: originalError,
        handlingStack: jasmine.any(String),
        startClocks: jasmine.any(Object),
        context: jasmine.objectContaining({
          framework: 'nextjs',
        }),
        componentStack: jasmine.stringContaining('ComponentSpy'),
      })
    )
  })
})
