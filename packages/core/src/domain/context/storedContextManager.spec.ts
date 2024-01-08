import type { Configuration } from '../configuration'
import { createNewEvent } from '../../../test'
import { DOM_EVENT } from '../../browser/addEventListener'
import { noop } from '../../tools/utils/functionUtils'
import { createStoredContextManager, buildStorageKey, removeStorageListeners } from './storedContextManager'
import { CustomerDataType } from './contextConstants'
import { createCustomerDataTracker } from './customerDataTracker'

describe('storedContextManager', () => {
  const PRODUCT_KEY = 'fake'
  const CUSTOMER_DATA_TYPE = CustomerDataType.User
  const STORAGE_KEY = buildStorageKey(PRODUCT_KEY, CUSTOMER_DATA_TYPE)

  let configuration: Configuration

  beforeEach(() => {
    configuration = {} as Configuration
  })

  afterEach(() => {
    localStorage.clear()
    removeStorageListeners()
  })

  describe('contextManager features', () => {
    it('starts with an empty context', () => {
      const manager = createStoredContextManager(
        configuration,
        PRODUCT_KEY,
        createCustomerDataTracker(CUSTOMER_DATA_TYPE, noop)
      )
      expect(manager.getContext()).toEqual({})
    })

    it('updates the context', () => {
      const manager = createStoredContextManager(
        configuration,
        PRODUCT_KEY,
        createCustomerDataTracker(CUSTOMER_DATA_TYPE, noop)
      )

      manager.setContext({ bar: 'foo' })
      expect(manager.getContext()).toEqual({ bar: 'foo' })

      manager.setContextProperty('qux', 'qix')
      expect(manager.getContext()).toEqual({ bar: 'foo', qux: 'qix' })

      manager.removeContextProperty('qux')
      expect(manager.getContext()).toEqual({ bar: 'foo' })

      manager.clearContext()
      expect(manager.getContext()).toEqual({})
    })

    it('should notify customer data tracker when the context is updated', () => {
      const customerDataTracker = createCustomerDataTracker(CUSTOMER_DATA_TYPE, noop)
      const updateCustomerDataSpy = spyOn(customerDataTracker, 'updateCustomerData')
      const manager = createStoredContextManager(configuration, PRODUCT_KEY, customerDataTracker)
      const context = { bar: 'foo' }

      manager.setContext(context)

      expect(updateCustomerDataSpy).toHaveBeenCalledWith(context)
    })
  })

  describe('storage features', () => {
    it('should synchronize with local storage at start', () => {
      localStorage.setItem(STORAGE_KEY, '{"bar":"foo"}')

      const manager = createStoredContextManager(
        configuration,
        PRODUCT_KEY,
        createCustomerDataTracker(CUSTOMER_DATA_TYPE, noop)
      )

      expect(manager.getContext()).toEqual({ bar: 'foo' })
    })

    it('should synchronize with local storage on storage events', () => {
      const manager = createStoredContextManager(
        configuration,
        PRODUCT_KEY,
        createCustomerDataTracker(CUSTOMER_DATA_TYPE, noop)
      )
      expect(manager.getContext()).toEqual({})

      localStorage.setItem(STORAGE_KEY, '{"bar":"foo"}')
      expect(manager.getContext()).toEqual({})

      window.dispatchEvent(createNewEvent(DOM_EVENT.STORAGE, { key: 'unknown' }))
      expect(manager.getContext()).toEqual({})

      window.dispatchEvent(createNewEvent(DOM_EVENT.STORAGE, { key: STORAGE_KEY }))
      expect(manager.getContext()).toEqual({ bar: 'foo' })
    })

    it('should update local storage on context updates', () => {
      const manager = createStoredContextManager(
        configuration,
        PRODUCT_KEY,
        createCustomerDataTracker(CUSTOMER_DATA_TYPE, noop)
      )
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
      createStoredContextManager(configuration, 'p1', createCustomerDataTracker(CUSTOMER_DATA_TYPE, noop)).setContext({
        bar: 'foo',
      })
      createStoredContextManager(configuration, 'p2', createCustomerDataTracker(CUSTOMER_DATA_TYPE, noop)).setContext({
        qux: 'qix',
      })

      expect(localStorage.getItem(buildStorageKey('p1', CUSTOMER_DATA_TYPE))).toBe('{"bar":"foo"}')
      expect(localStorage.getItem(buildStorageKey('p2', CUSTOMER_DATA_TYPE))).toBe('{"qux":"qix"}')
    })

    it('should store different data type in different storage key', () => {
      createStoredContextManager(
        configuration,
        PRODUCT_KEY,
        createCustomerDataTracker(CustomerDataType.User, noop)
      ).setContext({ bar: 'foo' })
      createStoredContextManager(
        configuration,
        PRODUCT_KEY,
        createCustomerDataTracker(CustomerDataType.GlobalContext, noop)
      ).setContext({ qux: 'qix' })

      expect(localStorage.getItem(buildStorageKey(PRODUCT_KEY, CustomerDataType.User))).toBe('{"bar":"foo"}')
      expect(localStorage.getItem(buildStorageKey(PRODUCT_KEY, CustomerDataType.GlobalContext))).toBe('{"qux":"qix"}')
    })
  })
})
