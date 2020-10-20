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
  })
})
