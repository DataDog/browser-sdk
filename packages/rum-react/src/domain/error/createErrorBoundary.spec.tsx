import React, { act } from 'react'

import { disableJasmineUncaughtExceptionTracking, ignoreConsoleLogs } from '../../../../core/test'
import { appendComponent } from '../../../test/appendComponent'
import { initReactOldBrowsersSupport } from '../../../test/reactOldBrowsersSupport'
import type { ErrorBoundaryFallback } from './errorBoundary'
import { createErrorBoundary } from './errorBoundary'

type FallbackFunctionComponent = Extract<ErrorBoundaryFallback, (...args: any[]) => any>

describe('createErrorBoundary', () => {
  beforeEach(() => {
    ignoreConsoleLogs('error', 'Error: error')
    disableJasmineUncaughtExceptionTracking()
    initReactOldBrowsersSupport()
  })

  it('renders children', () => {
    const TestErrorBoundary = createErrorBoundary(jasmine.createSpy(), 'TestErrorBoundary')
    const container = appendComponent(<TestErrorBoundary fallback={() => null}>bar</TestErrorBoundary>)

    expect(container.innerHTML).toBe('bar')
  })

  it('renders the fallback when an error occurs', () => {
    const TestErrorBoundary = createErrorBoundary(jasmine.createSpy(), 'TestErrorBoundary')
    const fallbackSpy = jasmine.createSpy<FallbackFunctionComponent>().and.returnValue('fallback')
    const ComponentSpy = jasmine.createSpy().and.throwError(new Error('error'))
    const container = appendComponent(
      <TestErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </TestErrorBoundary>
    )

    expect(fallbackSpy).toHaveBeenCalled()
    fallbackSpy.calls.all().forEach(({ args }) => {
      expect(args[0]).toEqual({
        error: new Error('error'),
        resetError: jasmine.any(Function),
      })
    })
    expect(container.innerHTML).toBe('fallback')
  })

  it('resets the error when resetError is called', () => {
    const TestErrorBoundary = createErrorBoundary(jasmine.createSpy(), 'TestErrorBoundary')
    const fallbackSpy = jasmine.createSpy<FallbackFunctionComponent>().and.returnValue('fallback')
    const ComponentSpy = jasmine.createSpy().and.throwError(new Error('error'))
    const container = appendComponent(
      <TestErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </TestErrorBoundary>
    )

    ComponentSpy.and.returnValue('bar')

    const { resetError } = fallbackSpy.calls.mostRecent().args[0]
    act(() => {
      resetError()
    })

    expect(container.innerHTML).toBe('bar')
  })

  it('passes error and errorInfo to the report callback', () => {
    const reportErrorSpy = jasmine.createSpy()
    const TestErrorBoundary = createErrorBoundary(reportErrorSpy, 'TestErrorBoundary')
    const originalError = new Error('error')
    const ComponentSpy = jasmine.createSpy().and.throwError(originalError)
    ;(ComponentSpy as any).displayName = 'ComponentSpy'

    appendComponent(
      <TestErrorBoundary fallback={() => null}>
        <ComponentSpy />
      </TestErrorBoundary>
    )

    expect(reportErrorSpy).toHaveBeenCalledOnceWith(
      originalError,
      jasmine.objectContaining({
        componentStack: jasmine.stringContaining('ComponentSpy'),
      })
    )
  })
})
