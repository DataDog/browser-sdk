import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { addVueError } from './addVueError'

describe('addVueError', () => {
  it('reports the error to the SDK', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeVuePlugin({ addError: addErrorSpy })

    const error = new Error('something broke')
    addVueError(error, null, 'mounted hook')

    expect(addErrorSpy).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        error,
        handlingStack: jasmine.any(String),
        componentStack: 'mounted hook',
        startClocks: jasmine.any(Object),
        context: { framework: 'vue' },
      })
    )
  })

  it('handles empty info gracefully', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeVuePlugin({ addError: addErrorSpy })
    addVueError(new Error('oops'), null, '')
    expect(addErrorSpy).toHaveBeenCalledTimes(1)
    expect(addErrorSpy.calls.mostRecent().args[0].componentStack).toBeUndefined()
  })

  it('should merge dd_context from the original error with vue error context', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeVuePlugin({ addError: addErrorSpy })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addVueError(originalError, null, 'mounted hook')

    expect(addErrorSpy.calls.mostRecent().args[0].context).toEqual({
      framework: 'vue',
      component: 'Menu',
      param: 123,
    })
  })
})
