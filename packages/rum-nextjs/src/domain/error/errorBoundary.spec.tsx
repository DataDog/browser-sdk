import React, { act } from 'react'

import {
  disableJasmineUncaughtExceptionTracking,
  ignoreConsoleLogs,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import { appendComponent } from '../../../../rum-react/test/appendComponent'
import { initReactOldBrowsersSupport } from '../../../../rum-react/test/reactOldBrowsersSupport'
import { nextjsPlugin, resetNextjsPlugin } from '../nextjsPlugin'
import type { ErrorBoundaryFallback } from './errorBoundary'
import { ErrorBoundary } from './errorBoundary'

type FallbackFunctionComponent = Extract<ErrorBoundaryFallback, (...args: any[]) => any>

function initializeNextjsPlugin() {
  const addErrorSpy = jasmine.createSpy()
  const publicApi = { startView: jasmine.createSpy() } as unknown as RumPublicApi
  const plugin = nextjsPlugin()
  plugin.onInit({ publicApi, initConfiguration: {} as RumInitConfiguration })
  plugin.onRumStart({ addError: addErrorSpy })
  return { addErrorSpy }
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    ignoreConsoleLogs('error', 'Error: error')
    disableJasmineUncaughtExceptionTracking()
    initReactOldBrowsersSupport()
    resetNextjsPlugin()
    registerCleanupTask(() => resetNextjsPlugin())
  })

  it('renders children', () => {
    const container = appendComponent(<ErrorBoundary fallback={() => null}>bar</ErrorBoundary>)
    expect(container.innerHTML).toBe('bar')
  })

  it('renders the fallback when an error occurs', () => {
    const fallbackSpy = jasmine.createSpy<FallbackFunctionComponent>().and.returnValue('fallback')
    const ComponentSpy = jasmine.createSpy().and.throwError(new Error('error'))
    const container = appendComponent(
      <ErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </ErrorBoundary>
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
      <ErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </ErrorBoundary>
    )

    ComponentSpy.and.returnValue('bar')

    const { resetError } = fallbackSpy.calls.mostRecent().args[0]
    act(() => {
      resetError()
    })

    expect(container.innerHTML).toBe('bar')
  })

  it('reports the error through addNextjsError', () => {
    const { addErrorSpy } = initializeNextjsPlugin()
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
