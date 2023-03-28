import type { Clock } from '../../test/specHelper'
import { mockClock } from '../../test/specHelper'
import { BYTES_COMPUTATION_THROTTLING_DELAY, createContextManager } from './contextManager'
import { CustomerDataType } from './heavyCustomerDataWarning'

describe('createContextManager', () => {
  let clock: Clock

  beforeEach(() => {
    clock = mockClock()
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('starts with an empty context', () => {
    const manager = createContextManager(CustomerDataType.User)
    expect(manager.get()).toEqual({})
  })

  it('updates the context', () => {
    const manager = createContextManager(CustomerDataType.User)
    manager.set({ bar: 'foo' })

    expect(manager.get()).toEqual({ bar: 'foo' })
  })

  it('updates the context without copy', () => {
    const manager = createContextManager(CustomerDataType.User)
    const context = {}
    manager.set(context)
    expect(manager.get()).toBe(context)
  })

  it('completely replaces the context', () => {
    const manager = createContextManager(CustomerDataType.User)
    manager.set({ a: 'foo' })
    expect(manager.get()).toEqual({ a: 'foo' })
    manager.set({ b: 'foo' })
    expect(manager.get()).toEqual({ b: 'foo' })
  })

  it('sets a context value', () => {
    const manager = createContextManager(CustomerDataType.User)
    manager.add('foo', 'bar')
    expect(manager.get()).toEqual({ foo: 'bar' })
  })

  it('removes a context value', () => {
    const manager = createContextManager(CustomerDataType.User)
    manager.set({ a: 'foo', b: 'bar' })
    manager.remove('a')
    expect(manager.get()).toEqual({ b: 'bar' })
    manager.removeContextProperty('b')
    expect(manager.getContext()).toEqual({})
  })

  it('should get a clone of the context from getContext', () => {
    const manager = createContextManager(CustomerDataType.User)
    expect(manager.getContext()).toEqual(manager.getContext())
    expect(manager.getContext()).not.toBe(manager.getContext())
  })

  it('should set a clone of context via setContext', () => {
    const nestedObject = { foo: 'bar' }
    const context = { nested: nestedObject }
    const manager = createContextManager(CustomerDataType.User)
    manager.setContext(context)
    expect(manager.getContext().nested).toEqual(nestedObject)
    expect(manager.getContext().nested).not.toBe(nestedObject)
  })

  it('should set a clone of the property via setContextProperty', () => {
    const nestedObject = { foo: 'bar' }
    const manager = createContextManager(CustomerDataType.User)
    manager.setContextProperty('nested', nestedObject)
    expect(manager.getContext().nested).toEqual(nestedObject)
    expect(manager.getContext().nested).not.toBe(nestedObject)
  })

  it('should clear context object via clearContext', () => {
    const context = { foo: 'bar' }
    const manager = createContextManager(CustomerDataType.User)
    manager.setContext(context)
    expect(manager.getContext()).toEqual(context)
    manager.clearContext()
    expect(manager.getContext()).toEqual({})
  })

  describe('bytes count computation', () => {
    it('should be done every time the context is updated', () => {
      const computeBytesCountStub = jasmine.createSpy('computeBytesCountStub').and.returnValue(1)
      const manager = createContextManager(CustomerDataType.User, computeBytesCountStub)

      manager.add('foo', 'bar')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      manager.remove('foo')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      manager.set({ foo: 'bar' })
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      manager.setContextProperty('foo', 'bar')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      manager.removeContextProperty('foo')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      manager.setContext({ foo: 'bar' })
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      manager.clearContext()
      const bytesCount = manager.getBytesCount()

      expect(bytesCount).toEqual(0)
      expect(computeBytesCountStub).toHaveBeenCalledTimes(6)
    })

    it('should be throttled to minimize the impact on performance', () => {
      const computeBytesCountStub = jasmine.createSpy('computeBytesCountStub').and.returnValue(1)
      const manager = createContextManager(CustomerDataType.User, computeBytesCountStub)

      manager.setContextProperty('1', 'foo') // leading call executed synchronously
      manager.setContextProperty('2', 'bar') // ignored
      manager.setContextProperty('3', 'bar') // trailing call executed after BYTES_COMPUTATION_THROTTLING_DELAY
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      expect(computeBytesCountStub).toHaveBeenCalledTimes(2)
    })
  })
})
