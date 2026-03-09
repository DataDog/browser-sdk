import { RumEventType } from '@datadog/browser-rum-core'
import { computeStackTrace, toStackTraceString } from '@datadog/browser-core'
import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { addVueError } from './addVueError'

describe('addVueError', () => {
  it('reports the error to the SDK', () => {
    const addEventSpy = jasmine.createSpy()
    initializeVuePlugin({ addEvent: addEventSpy })

    const error = new Error('something broke')
    error.name = 'VueError'

    addVueError(error, null, 'mounted hook')

    expect(addEventSpy).toHaveBeenCalledOnceWith(
      jasmine.any(Number),
      {
        type: RumEventType.ERROR,
        date: jasmine.any(Number),
        error: jasmine.objectContaining({
          id: jasmine.any(String),
          type: 'VueError',
          message: 'something broke',
          stack: toStackTraceString(computeStackTrace(error)),
          handling_stack: jasmine.any(String),
          component_stack: 'mounted hook',
          source_type: 'browser',
          handling: 'handled',
        }),
        context: { framework: 'vue' },
      },
      {
        error,
        handlingStack: jasmine.any(String),
      }
    )
  })

  it('handles empty info gracefully', () => {
    const addEventSpy = jasmine.createSpy()
    initializeVuePlugin({ addEvent: addEventSpy })
    addVueError(new Error('oops'), null, '')
    expect(addEventSpy).toHaveBeenCalledTimes(1)
    const payload = addEventSpy.calls.mostRecent().args[1]
    expect(payload.error.component_stack).toBeUndefined()
  })
})
