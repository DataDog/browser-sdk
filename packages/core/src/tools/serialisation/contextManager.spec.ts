import type { Clock } from '../../../test'
import { mockClock } from '../../../test'
import { display } from '../display'
import { BYTES_COMPUTATION_THROTTLING_DELAY, createContextManager } from './contextManager'
import { CustomerDataType, CUSTOMER_DATA_BYTES_LIMIT } from './heavyCustomerDataWarning'

describe('createContextManager', () => {
  let clock: Clock

  let displaySpy: jasmine.Spy<typeof display.warn>

  beforeEach(() => {
    clock = mockClock()
    displaySpy = spyOn(display, 'warn')
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('starts with an empty context', () => {
    const manager = createContextManager(CustomerDataType.User)
    expect(manager.getContext()).toEqual({})
  })

  it('updates the context', () => {
    const manager = createContextManager(CustomerDataType.User)
    manager.setContext({ bar: 'foo' })

    expect(manager.getContext()).toEqual({ bar: 'foo' })
  })

  it('completely replaces the context', () => {
    const manager = createContextManager(CustomerDataType.User)
    manager.setContext({ a: 'foo' })
    expect(manager.getContext()).toEqual({ a: 'foo' })
    manager.setContext({ b: 'foo' })
    expect(manager.getContext()).toEqual({ b: 'foo' })
  })

  it('sets a context value', () => {
    const manager = createContextManager(CustomerDataType.User)
    manager.setContextProperty('foo', 'bar')
    expect(manager.getContext()).toEqual({ foo: 'bar' })
  })

  it('removes a context value', () => {
    const manager = createContextManager(CustomerDataType.User)
    manager.setContext({ a: 'foo', b: 'bar' })
    manager.removeContextProperty('a')
    expect(manager.getContext()).toEqual({ b: 'bar' })
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

  it('should prevent setting non object values', () => {
    const manager = createContextManager(CustomerDataType.GlobalContext)
    manager.setContext(null as any)
    expect(manager.getContext()).toEqual({})
    manager.setContext(undefined as any)
    expect(manager.getContext()).toEqual({})
    manager.setContext(2 as any)
    expect(manager.getContext()).toEqual({})
  })

  describe('bytes count computation', () => {
    it('should be done every time the context is updated', () => {
      const computeBytesCountStub = jasmine.createSpy('computeBytesCountStub').and.returnValue(1)
      const manager = createContextManager(CustomerDataType.User, computeBytesCountStub)

      manager.setContextProperty('foo', 'bar')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      manager.removeContextProperty('foo')
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      manager.setContext({ foo: 'bar' })
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

  it('should warn once if the context bytes limit is reached', () => {
    const computeBytesCountStub = jasmine
      .createSpy('computeBytesCountStub')
      .and.returnValue(CUSTOMER_DATA_BYTES_LIMIT + 1)
    const manager = createContextManager(CustomerDataType.User, computeBytesCountStub)

    manager.setContext({})
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
    manager.setContext({})
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalledTimes(1)
  })
})
