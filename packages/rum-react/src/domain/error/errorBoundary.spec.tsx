import React, { act } from 'react'

import { disableJasmineUncaughtExceptionTracking, ignoreConsoleLogs } from '../../../../core/test'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import type { Fallback } from './errorBoundary'
import { ErrorBoundary } from './errorBoundary'

type FallbackFunctionComponent = Extract<Fallback, (...args: any[]) => any>

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Prevent React from displaying the error in the console
    ignoreConsoleLogs('error', 'Error: error')

    disableJasmineUncaughtExceptionTracking()
  })

  it('renders children', () => {
    const container = appendComponent(<ErrorBoundary fallback={() => null}>bar</ErrorBoundary>)
    expect(container.innerHTML).toBe('bar')
  })

  it('renders the fallback function component when an error occurs', () => {
    const fallbackSpy = jasmine.createSpy<FallbackFunctionComponent>().and.returnValue('fallback')
    const ComponentSpy = jasmine.createSpy().and.throwError(new Error('error'))
    const container = appendComponent(
      <ErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </ErrorBoundary>
    )
    expect(fallbackSpy).toHaveBeenCalled()
    // React calls the component multiple times while rendering
    fallbackSpy.calls.all().forEach(({ args }) => {
      expect(args[0]).toEqual({
        error: new Error('error'),
        resetError: jasmine.any(Function),
      })
    })
    expect(container.innerHTML).toBe('fallback')
  })

  it('renders the fallback class component when an error occurs', () => {
    class FallbackComponent extends React.Component<{ error: Error; resetError: () => void }> {
      constructor(props: { error: Error; resetError: () => void }) {
        super(props)
        expect(props).toEqual({ error: new Error('error'), resetError: jasmine.any(Function) })
      }

      render() {
        return 'fallback'
      }
    }

    const ComponentSpy = jasmine.createSpy().and.throwError(new Error('error'))
    const container = appendComponent(
      <ErrorBoundary fallback={FallbackComponent}>
        <ComponentSpy />
      </ErrorBoundary>
    )
    expect(container.innerHTML).toBe('fallback')
  })

  it('resets the error when resetError is called', () => {
    const fallbackSpy = jasmine.createSpy<FallbackFunctionComponent>().and.returnValue('fallback')
    const ComponentSpy = jasmine.createSpy().and.throwError(new Error('error'))
    const container = appendComponent(
      <ErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </ErrorBoundary>
    )

    // Don't throw the second time
    ComponentSpy.and.returnValue('bar')

    const { resetError } = fallbackSpy.calls.mostRecent().args[0]
    act(() => {
      resetError()
    })

    expect(container.innerHTML).toBe('bar')
  })

  it('reports the error to the SDK', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeReactPlugin({
      strategy: {
        addError: addErrorSpy,
      },
    })
    const originalError = new Error('error')
    const ComponentSpy = jasmine.createSpy().and.throwError(originalError)
    ;(ComponentSpy as any).displayName = 'ComponentSpy'

    appendComponent(
      <ErrorBoundary fallback={() => null}>
        <ComponentSpy />
      </ErrorBoundary>
    )

    expect(addErrorSpy).toHaveBeenCalledOnceWith({
      error: jasmine.any(Error),
      handlingStack: jasmine.any(String),
      componentStack: jasmine.stringContaining('ComponentSpy'),
      context: { framework: 'react' },
      startClocks: jasmine.anything(),
    })
    const { error } = addErrorSpy.calls.first().args[0]
    expect(error.message).toBe(originalError.message)
    expect(error.name).toBe(originalError.name)
    expect(error.cause).toBe(undefined)
  })
})
