import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
import { createFakeInternalApi } from '../../../../browser-rum-core/test'
import { initializeNuxtPlugin } from '../../../test/initializeNuxtPlugin'
import { addNuxtError } from './addNuxtError'

describe('addNuxtError', () => {
  it('reports the error to the SDK with info as first line of component_stack', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNuxtPlugin({ internalApi })

    const error = new Error('something broke')
    addNuxtError(error, null, 'mounted hook')

    expect(addEvent).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        baseRumEvent: jasmine.objectContaining({
          type: 'error',
          error: jasmine.objectContaining({
            message: 'something broke',
            component_stack: 'mounted hook',
          }),
          context: { framework: 'nuxt' },
        }),
        baggage: jasmine.objectContaining({ domainContext: { error, handlingStack: jasmine.any(String) } }),
      })
    )
  })

  it('includes component hierarchy in component_stack when instance is provided', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNuxtPlugin({ internalApi })

    const parentInternal = { type: { name: 'ParentComponent' }, parent: null } as unknown as ComponentInternalInstance
    const childInternal = {
      type: { name: 'ChildComponent' },
      parent: parentInternal,
    } as unknown as ComponentInternalInstance
    const mockInstance = { $: childInternal } as unknown as ComponentPublicInstance

    addNuxtError(new Error('oops'), mockInstance, 'mounted hook')

    const componentStack = (
      addEvent.calls.mostRecent().args[0] as { baseRumEvent: { error: { component_stack?: string } } }
    ).baseRumEvent.error.component_stack
    expect(componentStack).toContain('mounted hook')
    expect(componentStack).toContain('at <ChildComponent>')
    expect(componentStack).toContain('at <ParentComponent>')
  })

  it('handles empty info gracefully', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNuxtPlugin({ internalApi })
    addNuxtError(new Error('oops'), null, '')
    expect(addEvent).toHaveBeenCalledTimes(1)
    expect(
      (addEvent.calls.mostRecent().args[0] as { baseRumEvent: { error: { component_stack?: string } } }).baseRumEvent
        .error.component_stack
    ).toBeUndefined()
  })

  it('should merge dd_context from the original error with nuxt error context', () => {
    const { internalApi, addEvent } = createFakeInternalApi()
    initializeNuxtPlugin({ internalApi })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addNuxtError(originalError, null, 'mounted hook')

    expect((addEvent.calls.mostRecent().args[0] as { baseRumEvent: { context: object } }).baseRumEvent.context).toEqual(
      {
        framework: 'nuxt',
        component: 'Menu',
        param: 123,
      }
    )
  })
})
