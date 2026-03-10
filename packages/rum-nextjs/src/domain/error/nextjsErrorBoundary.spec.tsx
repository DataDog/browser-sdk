import React, { act } from 'react'
import type { RumInitConfiguration, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'
import {
  disableJasmineUncaughtExceptionTracking,
  ignoreConsoleLogs,
  registerCleanupTask,
} from '@datadog/browser-core/test'
import { appendComponent } from '../../../../rum-react/test/appendComponent'
import { nextjsPlugin, resetNextjsPlugin } from '../nextjsPlugin'
import type { NextjsErrorBoundaryFallback } from './nextjsErrorBoundary'
import { NextjsErrorBoundary } from './nextjsErrorBoundary'

type FallbackFunctionComponent = Extract<NextjsErrorBoundaryFallback, (...args: any[]) => any>

const INIT_CONFIGURATION = {} as RumInitConfiguration

function initializeNextjsPlugin() {
  const addEventSpy = jasmine.createSpy()
  const publicApi = { startView: jasmine.createSpy() } as unknown as RumPublicApi
  const plugin = nextjsPlugin()
  plugin.onInit({ publicApi, initConfiguration: { ...INIT_CONFIGURATION } })
  plugin.onRumStart({ addEvent: addEventSpy } as unknown as StartRumResult)
  registerCleanupTask(() => {
    resetNextjsPlugin()
  })
  return { addEventSpy }
}

describe('NextjsErrorBoundary', () => {
  beforeEach(() => {
    ignoreConsoleLogs('error', 'Error: error')
    disableJasmineUncaughtExceptionTracking()
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
    const { addEventSpy } = initializeNextjsPlugin()
    const originalError = new Error('error')
    const ComponentSpy = jasmine.createSpy().and.throwError(originalError)
    ;(ComponentSpy as any).displayName = 'ComponentSpy'

    appendComponent(
      <NextjsErrorBoundary fallback={() => null}>
        <ComponentSpy />
      </NextjsErrorBoundary>
    )

    expect(addEventSpy).toHaveBeenCalledOnceWith(
      jasmine.any(Number),
      jasmine.objectContaining({
        error: jasmine.objectContaining({
          message: originalError.message,
          handling_stack: jasmine.any(String),
          handling: 'handled',
          source_type: 'browser',
        }),
        context: jasmine.objectContaining({ framework: 'nextjs' }),
      }),
      jasmine.objectContaining({
        error: originalError,
        handlingStack: jasmine.any(String),
      })
    )
  })
})
