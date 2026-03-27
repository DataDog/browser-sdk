import type { ComponentInternalInstance, ComponentPublicInstance } from 'vue'
import { initializeNuxtPlugin } from '../../../test/initializeNuxtPlugin'
import { addNuxtError } from './addNuxtError'

describe('addNuxtError', () => {
  it('reports the error to the SDK with info as first line of component_stack', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })

    const error = new Error('something broke')
    addNuxtError(error, null, 'mounted hook')

    expect(addErrorSpy).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        error,
        handlingStack: jasmine.any(String),
        componentStack: 'mounted hook',
        startClocks: jasmine.any(Object),
        context: { framework: 'nuxt' },
      })
    )
  })

  it('includes component hierarchy in component_stack when instance is provided', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })

    const parentInternal = { type: { name: 'ParentComponent' }, parent: null } as unknown as ComponentInternalInstance
    const childInternal = {
      type: { name: 'ChildComponent' },
      parent: parentInternal,
    } as unknown as ComponentInternalInstance
    const mockInstance = { $: childInternal } as unknown as ComponentPublicInstance

    addNuxtError(new Error('oops'), mockInstance, 'mounted hook')

    const componentStack = addErrorSpy.calls.mostRecent().args[0].componentStack as string
    expect(componentStack).toContain('mounted hook')
    expect(componentStack).toContain('at <ChildComponent>')
    expect(componentStack).toContain('at <ParentComponent>')
  })

  it('handles empty info gracefully', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })

    addNuxtError(new Error('oops'), null, '')

    expect(addErrorSpy).toHaveBeenCalledTimes(1)
    expect(addErrorSpy.calls.mostRecent().args[0].componentStack).toBeUndefined()
  })

  it('should merge dd_context from the original error with nuxt error context', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { component: 'Menu', param: 123 }

    addNuxtError(originalError, null, 'mounted hook')

    expect(addErrorSpy.calls.mostRecent().args[0].context).toEqual({
      framework: 'nuxt',
      component: 'Menu',
      param: 123,
    })
  })

  it('should not let dd_context.framework overwrite the nuxt framework', () => {
    const addErrorSpy = jasmine.createSpy()
    initializeNuxtPlugin({ addError: addErrorSpy })
    const originalError = new Error('error message')
    ;(originalError as any).dd_context = { framework: 'custom' }

    addNuxtError(originalError, null, 'mounted hook')

    expect(addErrorSpy.calls.mostRecent().args[0].context).toEqual({ framework: 'nuxt' })
  })
})