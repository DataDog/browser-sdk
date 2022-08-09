import { createContextManager } from './contextManager'

describe('createContextManager', () => {
  it('starts with an empty context', () => {
    const manager = createContextManager()
    expect(manager.get()).toEqual({})
  })

  it('updates the context', () => {
    const manager = createContextManager()
    manager.set({ bar: 'foo' })
    expect(manager.get()).toEqual({ bar: 'foo' })
  })

  it('updates the context without copy', () => {
    const manager = createContextManager()
    const context = {}
    manager.set(context)
    expect(manager.get()).toBe(context)
  })

  it('completely replaces the context', () => {
    const manager = createContextManager()
    manager.set({ a: 'foo' })
    expect(manager.get()).toEqual({ a: 'foo' })
    manager.set({ b: 'foo' })
    expect(manager.get()).toEqual({ b: 'foo' })
  })

  it('sets a context value', () => {
    const manager = createContextManager()
    manager.add('foo', 'bar')
    expect(manager.get()).toEqual({ foo: 'bar' })
  })

  it('removes a context value', () => {
    const manager = createContextManager()
    manager.set({ a: 'foo', b: 'bar' })
    manager.remove('a')
    expect(manager.get()).toEqual({ b: 'bar' })
    manager.removeContextProperty('b')
    expect(manager.getContext()).toEqual({})
  })

  it('should get a clone of the context from getContext', () => {
    const manager = createContextManager()
    expect(manager.getContext()).toEqual(manager.getContext())
    expect(manager.getContext()).not.toBe(manager.getContext())
  })

  it('should set a clone of context via setContext', () => {
    const nestedObject = { foo: 'bar' }
    const context = { nested: nestedObject }
    const manager = createContextManager()
    manager.setContext(context)
    expect(manager.getContext().nested).toEqual(nestedObject)
    expect(manager.getContext().nested).not.toBe(nestedObject)
  })

  it('should set a clone of the property via setContextProperty', () => {
    const nestedObject = { foo: 'bar' }
    const manager = createContextManager()
    manager.setContextProperty('nested', nestedObject)
    expect(manager.getContext().nested).toEqual(nestedObject)
    expect(manager.getContext().nested).not.toBe(nestedObject)
  })

  it('should clear context object via clearContext', () => {
    const context = { foo: 'bar' }
    const manager = createContextManager()
    manager.setContext(context)
    expect(manager.getContext()).toEqual(context)
    manager.clearContext()
    expect(manager.getContext()).toEqual({})
  })
})
