import React, { act } from 'react'
import type { RumInitConfiguration, RumPublicApi } from '@datadog/browser-rum-core'
import {
  disableJasmineUncaughtExceptionTracking,
  ignoreConsoleLogs,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import { nextjsPlugin, resetNextjsPlugin } from '../nextjsPlugin'
import { appendComponent } from '../../../../rum-react/test/appendComponent'
import { initReactOldBrowsersSupport } from '../../../../rum-react/test/reactOldBrowsersSupport'
import type { NextjsErrorBoundaryFallback } from './nextjsErrorBoundary'
import { NextjsErrorBoundary } from './nextjsErrorBoundary'

type FallbackFunctionComponent = Extract<NextjsErrorBoundaryFallback, (...args: any[]) => any>

const INIT_CONFIGURATION = {} as RumInitConfiguration

function initializeNextjsPlugin() {
  const addErrorSpy = jasmine.createSpy()
  const publicApi = { startView: jasmine.createSpy() } as unknown as RumPublicApi
  const plugin = nextjsPlugin()
  plugin.onInit({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })
  plugin.onRumStart({ addError: addErrorSpy })
  registerCleanupTask(() => {
    resetNextjsPlugin()
  })
  return { addErrorSpy }
}

describe('NextjsErrorBoundary', () => {
  beforeEach(() => {
    ignoreConsoleLogs('error', 'Error: error')
    disableJasmineUncaughtExceptionTracking()
    initReactOldBrowsersSupport()
    registerCleanupTask(() => {
      resetNextjsPlugin()
    })
  })

  it('renders children', () => {
    const container = appendComponent(<NextjsErrorBoundary fallback={() => null}>bar</NextjsErrorBoundary>)
    expect(container.innerHTML).toBe('bar')
  })

  it('renders the fallback when an error occurs', () => {
    const fallbackSpy = jasmine.createSpy<FallbackFunctionComponent>().and.returnValue('fallback')
    const ComponentSpy = jasmine.createSpy().and.throwError(new Error('error'))
    const container = appendComponent(
      <NextjsErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </NextjsErrorBoundary>
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
      <NextjsErrorBoundary fallback={fallbackSpy}>
        <ComponentSpy />
      </NextjsErrorBoundary>
    )

    ComponentSpy.and.returnValue('bar')

    const { resetError } = fallbackSpy.calls.mostRecent().args[0]
    act(() => {
      resetError()
    })

    expect(container.innerHTML).toBe('bar')
  })

  it('calls addNextjsError with the caught error', () => {
    const { addErrorSpy } = initializeNextjsPlugin()
    const originalError = new Error('error')
    const ComponentSpy = jasmine.createSpy().and.throwError(originalError)

    appendComponent(
      <NextjsErrorBoundary fallback={() => null}>
        <ComponentSpy />
      </NextjsErrorBoundary>
    )

    expect(addErrorSpy).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        error: originalError,
        handlingStack: jasmine.any(String),
        startClocks: jasmine.any(Object),
        context: {
          framework: 'nextjs',
        },
      })
    )
  })
})
