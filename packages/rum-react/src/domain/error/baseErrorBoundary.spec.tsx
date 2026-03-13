import React, { act } from 'react'
import type { ErrorInfo } from 'react'

import { disableJasmineUncaughtExceptionTracking, ignoreConsoleLogs } from '../../../../core/test'
import { appendComponent } from '../../../test/appendComponent'
import { initReactOldBrowsersSupport } from '../../../test/reactOldBrowsersSupport'
import type { ErrorBoundaryFallback } from './errorBoundary'
import { BaseErrorBoundary } from './errorBoundary'

type FallbackFunctionComponent = Extract<ErrorBoundaryFallback, (...args: any[]) => any>

let reportErrorSpy: jasmine.Spy

class TestErrorBoundary extends BaseErrorBoundary {
  protected reportError(error: Error, errorInfo: ErrorInfo) {
    reportErrorSpy(error, errorInfo)
  }
}

describe('BaseErrorBoundary', () => {
  beforeEach(() => {
    reportErrorSpy = jasmine.createSpy()
    ignoreConsoleLogs('error', 'Error: error')
    disableJasmineUncaughtExceptionTracking()
    initReactOldBrowsersSupport()
  })

  it('renders children', () => {
    const container = appendComponent(<TestErrorBoundary fallback={() => null}>bar</TestErrorBoundary>)

    expect(container.innerHTML).toBe('bar')
  })

  it('renders the fallback when an error occurs', () => {
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

  it('passes error and errorInfo to reportError', () => {
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
