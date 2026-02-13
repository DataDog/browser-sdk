import { vi } from 'vitest'
import React, { act } from 'react'

import { toStackTraceString, computeStackTrace } from '@datadog/browser-core'
import { RumEventType } from '@datadog/browser-rum-core'
import { disableJasmineUncaughtExceptionTracking, ignoreConsoleLogs } from '../../../../core/test'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { initReactOldBrowsersSupport } from '../../../test/reactOldBrowsersSupport'
import type { ErrorBoundaryFallback } from './errorBoundary'
import { ErrorBoundary } from './errorBoundary'

type FallbackFunctionComponent = Extract<ErrorBoundaryFallback, (...args: any[]) => any>

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Prevent React from displaying the error in the console
    ignoreConsoleLogs('error', 'Error: error')

    disableJasmineUncaughtExceptionTracking()
    initReactOldBrowsersSupport()
  })

  it('renders children', () => {
    const container = appendComponent(<ErrorBoundary fallback={() => null}>bar</ErrorBoundary>)
    expect(container.innerHTML).toBe('bar')
  })

  it('renders the fallback function component when an error occurs', () => {
    const fallbackSpy = vi.fn<FallbackFunctionComponent>().mockReturnValue('fallback')
    const ComponentSpy = vi.fn().mockImplementation(() => { throw new Error('error' ) })
    const container = appendComponent(
      <ErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </ErrorBoundary>
    )
    expect(fallbackSpy).toHaveBeenCalled()
    // React calls the component multiple times while rendering
    fallbackSpy.mock.calls.forEach((args) => {
      expect(args[0]).toEqual({
        error: new Error('error'),
        resetError: expect.any(Function),
      })
    })
    expect(container.innerHTML).toBe('fallback')
  })

  it('renders the fallback class component when an error occurs', () => {
    class FallbackComponent extends React.Component<{ error: Error; resetError: () => void }> {
      constructor(props: { error: Error; resetError: () => void }) {
        super(props)
        expect(props).toEqual({ error: new Error('error'), resetError: expect.any(Function) })
      }

      render() {
        return 'fallback'
      }
    }

    const ComponentSpy = vi.fn().mockImplementation(() => { throw new Error('error' ) })
    const container = appendComponent(
      <ErrorBoundary fallback={FallbackComponent}>
        <ComponentSpy />
      </ErrorBoundary>
    )
    expect(container.innerHTML).toBe('fallback')
  })

  it('resets the error when resetError is called', () => {
    const fallbackSpy = vi.fn<FallbackFunctionComponent>().mockReturnValue('fallback')
    const ComponentSpy = vi.fn().mockImplementation(() => { throw new Error('error' ) })
    const container = appendComponent(
      <ErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </ErrorBoundary>
    )

    // Don't throw the second time
    ComponentSpy.mockReturnValue('bar')

    const { resetError } = fallbackSpy.mock.lastCall[0]
    act(() => {
      resetError()
    })

    expect(container.innerHTML).toBe('bar')
  })

  it('reports the error to the SDK', () => {
    const addEventSpy = vi.fn()
    initializeReactPlugin({
      addEvent: addEventSpy,
    })
    const originalError = new Error('error')
    const ComponentSpy = vi.fn().mockImplementation(() => { throw originalError })
    ;(ComponentSpy as any).displayName = 'ComponentSpy'

    appendComponent(
      <ErrorBoundary fallback={() => null}>
        <ComponentSpy />
      </ErrorBoundary>
    )

    expect(addEventSpy).toHaveBeenCalledTimes(1)
    expect(addEventSpy).toHaveBeenCalledWith(
      expect.any(Number),
      {
        type: RumEventType.ERROR,
        date: expect.any(Number),
        error: expect.objectContaining({
          id: expect.any(String),
          type: originalError.name,
          message: originalError.message,
          stack: toStackTraceString(computeStackTrace(originalError)),
          handling_stack: expect.any(String),
          component_stack: expect.stringContaining('ComponentSpy'),
          source_type: 'browser',
          handling: 'handled',
        }),
        context: {
          framework: 'react',
        },
      },
      {
        error: originalError,
        handlingStack: expect.any(String),
      }
    )
  })
})
