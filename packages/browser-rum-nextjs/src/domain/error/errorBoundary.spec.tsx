import React from 'react'

import { disableJasmineUncaughtExceptionTracking, ignoreConsoleLogs } from '@datadog/browser-core/test'
import { appendComponent } from '../../../../browser-rum-react/test/appendComponent'
import { initReactOldBrowsersSupport } from '../../../../browser-rum-react/test/reactOldBrowsersSupport'
import { initializeNextjsPlugin } from '../../../test/initializeNextjsPlugin'
import { createFakeInternalApi } from '../../../../browser-rum-core/test'
import { ErrorBoundary } from './errorBoundary'

// Component behavior (renders children, fallback, resetError) is tested via createErrorBoundary
// in packages/browser-rum-react/src/domain/error/errorBoundary.spec.tsx

describe('NextjsErrorBoundary', () => {
  it('reports the error through addNextjsError', () => {
    ignoreConsoleLogs('error', 'Error: error')
    disableJasmineUncaughtExceptionTracking()
    initReactOldBrowsersSupport()

    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNextjsPlugin({ internalApi })
    const originalError = new Error('error')
    const ComponentSpy = jasmine.createSpy().and.throwError(originalError)
    ;(ComponentSpy as any).displayName = 'ComponentSpy'

    appendComponent(
      <ErrorBoundary fallback={() => null}>
        <ComponentSpy />
      </ErrorBoundary>
    )

    expect(addEvent).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          type: 'error',
          error: jasmine.objectContaining({ message: 'error' }),
          context: jasmine.objectContaining({
            framework: 'nextjs',
          }),
        }),
        baggage: jasmine.objectContaining({
          domainContext: { error: originalError, handlingStack: jasmine.any(String) },
        }),
      })
    )
    expect(
      (addEvent.calls.mostRecent().args[0] as { baseRumEvent: { error: { component_stack?: string } } }).baseRumEvent
        .error.component_stack
    ).toContain('ComponentSpy')
  })
})
