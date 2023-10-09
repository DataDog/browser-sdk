import type { Configuration } from '../configuration'
import { display } from '../../tools/display'
import type { Clock } from '../../../test'
import { mockClock, createNewEvent } from '../../../test'
import { DOM_EVENT } from '../../browser/addEventListener'
import { CUSTOMER_DATA_BYTES_LIMIT } from './heavyCustomerDataWarning'
import { createStoredContextManager, buildStorageKey, removeStorageListeners } from './storedContextManager'
import { CustomerDataType } from './contextConstants'
import { BYTES_COMPUTATION_THROTTLING_DELAY } from './contextManager'

describe('storedContextManager', () => {
  const PRODUCT_KEY = 'fake'
  const CUSTOMER_DATA_TYPE = CustomerDataType.User
  const STORAGE_KEY = buildStorageKey(PRODUCT_KEY, CUSTOMER_DATA_TYPE)

  let clock: Clock
  let displaySpy: jasmine.Spy<typeof display.warn>
  let configuration: Configuration

  beforeEach(() => {
    clock = mockClock()
    configuration = {} as Configuration
    displaySpy = spyOn(display, 'warn')
  })

  afterEach(() => {
    clock.cleanup()
    localStorage.clear()
    removeStorageListeners()
  })

  describe('contextManager features', () => {
    it('starts with an empty context', () => {
      const manager = createStoredContextManager(configuration, PRODUCT_KEY, CUSTOMER_DATA_TYPE)
      expect(manager.getContext()).toEqual({})
    })

    it('updates the context', () => {
      const manager = createStoredContextManager(configuration, PRODUCT_KEY, CUSTOMER_DATA_TYPE)

      manager.setContext({ bar: 'foo' })
      expect(manager.getContext()).toEqual({ bar: 'foo' })

      manager.setContextProperty('qux', 'qix')
      expect(manager.getContext()).toEqual({ bar: 'foo', qux: 'qix' })

      manager.removeContextProperty('qux')
      expect(manager.getContext()).toEqual({ bar: 'foo' })

      manager.clearContext()
      expect(manager.getContext()).toEqual({})
    })

    it('should warn if the context bytes limit is reached', () => {
      const computeBytesCountStub = jasmine
        .createSpy('computeBytesCountStub')
        .and.returnValue(CUSTOMER_DATA_BYTES_LIMIT + 1)
      const manager = createStoredContextManager(configuration, PRODUCT_KEY, CUSTOMER_DATA_TYPE, computeBytesCountStub)

      manager.setContext({})
      clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

      expect(displaySpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('storage features', () => {
    it('should synchronize with local storage at start', () => {
      localStorage.setItem(STORAGE_KEY, '{"bar":"foo"}')

      const manager = createStoredContextManager(configuration, PRODUCT_KEY, CUSTOMER_DATA_TYPE)

      expect(manager.getContext()).toEqual({ bar: 'foo' })
    })

    it('should synchronize with local storage on storage events', () => {
      const manager = createStoredContextManager(configuration, PRODUCT_KEY, CUSTOMER_DATA_TYPE)
      expect(manager.getContext()).toEqual({})

      localStorage.setItem(STORAGE_KEY, '{"bar":"foo"}')
      expect(manager.getContext()).toEqual({})

      window.dispatchEvent(createNewEvent(DOM_EVENT.STORAGE, { key: 'unknown' }))
      expect(manager.getContext()).toEqual({})

      window.dispatchEvent(createNewEvent(DOM_EVENT.STORAGE, { key: STORAGE_KEY }))
      expect(manager.getContext()).toEqual({ bar: 'foo' })
    })

    it('should update local storage on context updates', () => {
      const manager = createStoredContextManager(configuration, PRODUCT_KEY, CUSTOMER_DATA_TYPE)
      expect(localStorage.getItem(STORAGE_KEY)).toBe(null)

      manager.setContext({ bar: 'foo' })
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{"bar":"foo"}')

      manager.setContextProperty('qux', 'qix')
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{"bar":"foo","qux":"qix"}')

      manager.removeContextProperty('qux')
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{"bar":"foo"}')

      manager.clearContext()
      expect(localStorage.getItem(STORAGE_KEY)).toBe('{}')
    })

    it('should store different product data in different storage key', () => {
      createStoredContextManager(configuration, 'p1', CUSTOMER_DATA_TYPE).setContext({ bar: 'foo' })
      createStoredContextManager(configuration, 'p2', CUSTOMER_DATA_TYPE).setContext({ qux: 'qix' })

      expect(localStorage.getItem(buildStorageKey('p1', CUSTOMER_DATA_TYPE))).toBe('{"bar":"foo"}')
      expect(localStorage.getItem(buildStorageKey('p2', CUSTOMER_DATA_TYPE))).toBe('{"qux":"qix"}')
    })

    it('should store different data type in different storage key', () => {
      createStoredContextManager(configuration, PRODUCT_KEY, CustomerDataType.User).setContext({ bar: 'foo' })
      createStoredContextManager(configuration, PRODUCT_KEY, CustomerDataType.GlobalContext).setContext({ qux: 'qix' })

      expect(localStorage.getItem(buildStorageKey(PRODUCT_KEY, CustomerDataType.User))).toBe('{"bar":"foo"}')
      expect(localStorage.getItem(buildStorageKey(PRODUCT_KEY, CustomerDataType.GlobalContext))).toBe('{"qux":"qix"}')
    })
  })
})
