import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
import { createFakeInternalApi } from '../../../../browser-rum-core/test'
import { initializeVuePlugin } from '../../../test/initializeVuePlugin'
import { addVueError } from './addVueError'

describe('addVueError', () => {
  it('reports the error to the SDK with info as first line of component_stack', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeVuePlugin({ internalApi })

    const error = new Error('something broke')
    addVueError(error, null, 'mounted hook')

    expect(addEvent).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          type: 'error',
          error: jasmine.objectContaining({
            message: 'something broke',
            component_stack: 'mounted hook',
          }),
          context: { framework: 'vue' },
        }),
        baggage: jasmine.objectContaining({ originalError: error }),
      })
    )
  })

  it('includes component hierarchy in component_stack when instance is provided', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeVuePlugin({ internalApi })

    // Build a mock instance chain without @vue/test-utils to avoid
    // Object.fromEntries compatibility issues on older browsers
    const parentInternal = { type: { name: 'ParentComponent' }, parent: null } as unknown as ComponentInternalInstance
    const childInternal = {
      type: { name: 'ChildComponent' },
      parent: parentInternal,
    } as unknown as ComponentInternalInstance
    const mockInstance = { $: childInternal } as unknown as ComponentPublicInstance

    addVueError(new Error('oops'), mockInstance, 'mounted hook')

    const componentStack = (
      addEvent.calls.mostRecent().args[0] as {
        baseRumEvent: { error: { component_stack?: string } }
      }
    ).baseRumEvent.error.component_stack
    expect(componentStack).toContain('mounted hook')
    expect(componentStack).toContain('at <ChildComponent>')
    expect(componentStack).toContain('at <ParentComponent>')
  })

  it('handles empty info gracefully', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeVuePlugin({ internalApi })
    addVueError(new Error('oops'), null, '')
    expect(addEvent).toHaveBeenCalledTimes(1)
    expect(
      (addEvent.calls.mostRecent().args[0] as { baseRumEvent: { error: { component_stack?: string } } }).baseRumEvent
        .error.component_stack
    ).toBeUndefined()
  })

  it('should merge dd_context from the original error with vue error context', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeVuePlugin({ internalApi })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addVueError(originalError, null, 'mounted hook')

    expect(addEvent).toHaveBeenCalledWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          context: {
            framework: 'vue',
            component: 'Menu',
            param: 123,
          },
        }),
        baggage: jasmine.objectContaining({ originalError }),
      })
    )
  })
})
