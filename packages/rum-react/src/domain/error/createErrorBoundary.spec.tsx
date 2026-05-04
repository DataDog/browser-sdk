import { describe, it, expect, vi, beforeEach } from 'vitest'
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
    const TestErrorBoundary = createErrorBoundary(vi.fn(), 'TestErrorBoundary')
    const container = appendComponent(<TestErrorBoundary fallback={() => null}>bar</TestErrorBoundary>)

    expect(container.innerHTML).toBe('bar')
  })

  it('renders the fallback when an error occurs', () => {
    const TestErrorBoundary = createErrorBoundary(vi.fn(), 'TestErrorBoundary')
    const fallbackSpy = vi.fn<FallbackFunctionComponent>().mockReturnValue('fallback' as any)
    const ComponentSpy = vi.fn().mockImplementation(() => {
      throw new Error('error')
    })
    const container = appendComponent(
      <TestErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </TestErrorBoundary>
    )

    expect(fallbackSpy).toHaveBeenCalled()
    fallbackSpy.mock.calls.forEach(([arg]) => {
      expect(arg).toEqual({
        error: new Error('error'),
        resetError: expect.any(Function),
      })
    })
    expect(container.innerHTML).toBe('fallback')
  })

  it('resets the error when resetError is called', () => {
    const TestErrorBoundary = createErrorBoundary(vi.fn(), 'TestErrorBoundary')
    const fallbackSpy = vi.fn<FallbackFunctionComponent>().mockReturnValue('fallback' as any)
    const ComponentSpy = vi.fn().mockImplementation(() => {
      throw new Error('error')
    })
    const container = appendComponent(
      <TestErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </TestErrorBoundary>
    )

    ComponentSpy.mockReturnValue('bar' as any)

    const { resetError } = fallbackSpy.mock.lastCall![0]
    act(() => {
      resetError()
    })

    expect(container.innerHTML).toBe('bar')
  })

  it('passes error and errorInfo to the report callback', () => {
    const reportErrorSpy = vi.fn()
    const TestErrorBoundary = createErrorBoundary(reportErrorSpy, 'TestErrorBoundary')
    const originalError = new Error('error')
    const ComponentSpy = vi.fn().mockImplementation(() => {
      throw originalError
    })
    ;(ComponentSpy as any).displayName = 'ComponentSpy'

    appendComponent(
      <TestErrorBoundary fallback={() => null}>
        <ComponentSpy />
      </TestErrorBoundary>
    )

    expect(reportErrorSpy).toHaveBeenCalledTimes(1)
    expect(reportErrorSpy).toHaveBeenCalledWith(
      originalError,
      expect.objectContaining({
        componentStack: expect.stringContaining('ComponentSpy'),
      })
    )
  })
})
