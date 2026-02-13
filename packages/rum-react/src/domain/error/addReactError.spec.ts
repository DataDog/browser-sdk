import { vi } from 'vitest'
import { RumEventType } from '@datadog/browser-rum-core'
import { computeStackTrace, toStackTraceString } from '@datadog/browser-core'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { addReactError } from './addReactError'

describe('addReactError', () => {
  it('reports the error to the SDK', () => {
    const addEventSpy = vi.fn()
    initializeReactPlugin({
      addEvent: addEventSpy,
    })
    const originalError = new Error('error message')
    originalError.name = 'CustomError'

    addReactError(originalError, { componentStack: 'at ComponentSpy toto.js' })

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
          component_stack: expect.stringContaining('at ComponentSpy'),
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

  it('should merge dd_context from the original error with react error context', () => {
    const addEventSpy = vi.fn()
    initializeReactPlugin({
      addEvent: addEventSpy,
    })
    const originalError = new Error('error message')
    originalError.name = 'CustomError'
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addReactError(originalError, {})

    expect(addEventSpy.mock.lastCall[1]).toEqual(
      expect.objectContaining({
        context: {
          framework: 'react',
          component: 'Menu',
          param: 123,
        },
      })
    )
  })
})
