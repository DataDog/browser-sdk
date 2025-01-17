import { noop } from '../../tools/utils/functionUtils'
import { createContextManager } from './contextManager'
import { createCustomerDataTracker } from './customerDataTracker'

function createNoopCustomerDataTracker() {
  return createContextManager({ customerDataTracker: createCustomerDataTracker(noop) })
}

describe('createContextManager', () => {
  it('starts with an empty context', () => {
    const manager = createNoopCustomerDataTracker()
    expect(manager.getContext()).toEqual({})
  })

  it('updates the context', () => {
    const manager = createNoopCustomerDataTracker()
    manager.setContext({ bar: 'foo' })

    expect(manager.getContext()).toEqual({ bar: 'foo' })
  })

  it('completely replaces the context', () => {
    const manager = createNoopCustomerDataTracker()
    manager.setContext({ a: 'foo' })
    expect(manager.getContext()).toEqual({ a: 'foo' })
    manager.setContext({ b: 'foo' })
    expect(manager.getContext()).toEqual({ b: 'foo' })
  })

  it('sets a context value', () => {
    const manager = createNoopCustomerDataTracker()
    manager.setContextProperty('foo', 'bar')
    expect(manager.getContext()).toEqual({ foo: 'bar' })
  })

  it('removes a context value', () => {
    const manager = createNoopCustomerDataTracker()
    manager.setContext({ a: 'foo', b: 'bar' })
    manager.removeContextProperty('a')
    expect(manager.getContext()).toEqual({ b: 'bar' })
    manager.removeContextProperty('b')
    expect(manager.getContext()).toEqual({})
  })

  it('should get a clone of the context from getContext', () => {
    const manager = createNoopCustomerDataTracker()
    expect(manager.getContext()).toEqual(manager.getContext())
    expect(manager.getContext()).not.toBe(manager.getContext())
  })

  it('should set a clone of context via setContext', () => {
    const nestedObject = { foo: 'bar' }
    const context = { nested: nestedObject }
    const manager = createNoopCustomerDataTracker()
    manager.setContext(context)
    expect(manager.getContext().nested).toEqual(nestedObject)
    expect(manager.getContext().nested).not.toBe(nestedObject)
  })

  it('should set a clone of the property via setContextProperty', () => {
    const nestedObject = { foo: 'bar' }
    const manager = createNoopCustomerDataTracker()
    manager.setContextProperty('nested', nestedObject)
    expect(manager.getContext().nested).toEqual(nestedObject)
    expect(manager.getContext().nested).not.toBe(nestedObject)
  })

  it('should clear context object via clearContext', () => {
    const context = { foo: 'bar' }
    const manager = createNoopCustomerDataTracker()
    manager.setContext(context)
    expect(manager.getContext()).toEqual(context)
    manager.clearContext()
    expect(manager.getContext()).toEqual({})
  })

  it('should prevent setting non object values', () => {
    const manager = createNoopCustomerDataTracker()
    manager.setContext(null as any)
    expect(manager.getContext()).toEqual({})
    manager.setContext(undefined as any)
    expect(manager.getContext()).toEqual({})
    manager.setContext(2 as any)
    expect(manager.getContext()).toEqual({})
  })

  it('should notify customer data tracker when the context is updated', () => {
    const customerDataTracker = createCustomerDataTracker(noop)
    const updateCustomerDataSpy = spyOn(customerDataTracker, 'updateCustomerData')
    const resetCustomerDataSpy = spyOn(customerDataTracker, 'resetCustomerData')
    const manager = createContextManager({ customerDataTracker })

    manager.setContextProperty('foo', 'bar')
    manager.removeContextProperty('foo')
    manager.setContext({ foo: 'bar' })
    manager.setContextProperty('foo', 'bar')
    manager.removeContextProperty('foo')
    manager.setContext({ foo: 'bar' })
    manager.clearContext()

    expect(updateCustomerDataSpy).toHaveBeenCalledTimes(6)
    expect(resetCustomerDataSpy).toHaveBeenCalledTimes(1)
  })

  describe('changeObservable', () => {
    it('should notify on context changes', () => {
      const changeSpy = jasmine.createSpy('change')
      const manager = createNoopCustomerDataTracker()
      manager.changeObservable.subscribe(changeSpy)

      manager.getContext()
      expect(changeSpy).not.toHaveBeenCalled()

      manager.setContext({ foo: 'bar' })
      expect(changeSpy).toHaveBeenCalledTimes(1)

      manager.setContextProperty('qux', 'qix')
      expect(changeSpy).toHaveBeenCalledTimes(2)

      manager.removeContextProperty('qux')
      expect(changeSpy).toHaveBeenCalledTimes(3)

      manager.clearContext()
      expect(changeSpy).toHaveBeenCalledTimes(4)
    })
  })
})
