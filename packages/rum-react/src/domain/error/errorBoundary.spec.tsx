import React from 'react'
import { flushSync } from 'react-dom'

import { disableJasmineUncaughtExceptionTracking } from '../../../../core/test'
import { appendComponent } from '../../../test/appendComponent'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import type { Fallback } from './errorBoundary'
import { ErrorBoundary } from './errorBoundary'

type FallbackFunctionComponent = Extract<Fallback, (...args: any[]) => any>

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Prevent React from displaying the error in the console
    spyOn(console, 'error')
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
    expect(fallbackSpy).toHaveBeenCalledWith({ error: new Error('error'), resetError: jasmine.any(Function) }, {})
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
    flushSync(() => {
      resetError()
    })

    expect(container.innerHTML).toBe('bar')
  })

  it('reports the error to the SDK', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeReactPlugin({
      publicApi: {
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

    expect(addErrorSpy).toHaveBeenCalledOnceWith(jasmine.any(Error), { framework: 'react' })
    const error = addErrorSpy.calls.first().args[0]
    expect(error.message).toBe('error')
    expect(error.name).toBe('ReactRenderingError')
    expect(error.stack).toContain('ComponentSpy')
    expect(error.cause).toBe(originalError)
  })
})
