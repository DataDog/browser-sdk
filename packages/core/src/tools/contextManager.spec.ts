import { contextBytesCounterStub } from '../../test/specHelper'
import { contextBytesCounter, createContextManager } from './contextManager'
import { computeBytesCount } from './utils'

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

  it('should invalidate the context bytes counter at each mutation', () => {
    const bytesCountStub = contextBytesCounterStub()
    const manager = createContextManager(bytesCountStub)
    manager.add('foo', 'bar')
    manager.remove('foo')
    manager.set({ foo: 'bar' })
    manager.removeContextProperty('foo')
    manager.setContext({ foo: 'bar' })
    manager.clearContext()

    expect(bytesCountStub.invalidate).toHaveBeenCalledTimes(6)
  })

  it('should get the context bytes count', () => {
    const bytesCountStub = contextBytesCounterStub()
    const manager = createContextManager(bytesCountStub)
    const contextBytesCount = manager.getBytesCount()

    expect(contextBytesCount).toEqual(1)
  })
})

describe('contextBytesCounter', () => {
  let computeBytesCountSpy: jasmine.Spy
  let counter: ReturnType<typeof contextBytesCounter>

  beforeEach(() => {
    computeBytesCountSpy = jasmine.createSpy('computeBytesCount', computeBytesCount).and.callThrough()
    counter = contextBytesCounter(computeBytesCountSpy)
  })

  it('should compute the batch count when the cache is invalidate', () => {
    const bytesCount1 = counter.compute({ a: 'b' })
    counter.invalidate()
    const bytesCount2 = counter.compute({ foo: 'bar' })

    expect(computeBytesCountSpy).toHaveBeenCalledTimes(2)
    expect(bytesCount1).not.toEqual(bytesCount2)
  })

  it('should use the cached bytes count when the cache is not invalidate', () => {
    const bytesCount1 = counter.compute({ a: 'b' })
    const bytesCount2 = counter.compute({ foo: 'bar' })
    expect(computeBytesCountSpy).toHaveBeenCalledTimes(1)
    expect(bytesCount1).toEqual(bytesCount2)
  })

  it('should return a bytes count at 0 when the object is empty', () => {
    const bytesCount = counter.compute({})
    expect(bytesCount).toEqual(0)
  })
})
