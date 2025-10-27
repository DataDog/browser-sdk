import { RumEventType } from '@datadog/browser-rum-core'
import { computeStackTrace, toStackTraceString } from '@datadog/browser-core'
import { initializeReactPlugin } from '../../../test/initializeReactPlugin'
import { addReactError } from './addReactError'

describe('addReactError', () => {
  it('reports the error to the SDK', () => {
    const addEventSpy = jasmine.createSpy()
    initializeReactPlugin({
      addEvent: addEventSpy,
    })
    const originalError = new Error('error message')
    originalError.name = 'CustomError'

    addReactError(originalError, { componentStack: 'at ComponentSpy toto.js' })

    expect(addEventSpy).toHaveBeenCalledOnceWith(
      jasmine.any(Number),
      {
        type: RumEventType.ERROR,
        date: jasmine.any(Number),
        error: jasmine.objectContaining({
          id: jasmine.any(String),
          type: originalError.name,
          message: originalError.message,
          stack: toStackTraceString(computeStackTrace(originalError)),
          handling_stack: jasmine.any(String),
          component_stack: jasmine.stringContaining('at ComponentSpy'),
          source_type: 'browser',
          handling: 'handled',
        }),
        context: {
          framework: 'react',
        },
      },
      {
        error: originalError,
        handlingStack: jasmine.any(String),
      }
    )
  })

  it('should merge dd_context from the original error with react error context', () => {
    const addEventSpy = jasmine.createSpy()
    initializeReactPlugin({
      addEvent: addEventSpy,
    })
    const originalError = new Error('error message')
    originalError.name = 'CustomError'
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addReactError(originalError, {})

    expect(addEventSpy.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({
        context: {
          framework: 'react',
          component: 'Menu',
          param: 123,
        },
      })
    )
  })
})
