import type { Configuration } from '../configuration'
import { createNewEvent } from '../../../test'
import { DOM_EVENT } from '../../browser/addEventListener'
import { noop } from '../../tools/utils/functionUtils'
import type { Context } from '../../tools/serialisation/context'
import { storeContextManager, buildStorageKey, removeStorageListeners } from './storeContextManager'
import { CustomerDataType } from './contextConstants'
import { createCustomerDataTracker } from './customerDataTracker'
import { createContextManager } from './contextManager'

describe('storeContextManager', () => {
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

  it('should synchronize with local storage at start', () => {
    localStorage.setItem(STORAGE_KEY, '{"bar":"foo"}')

    const manager = createStoredContextManager()

    expect(manager.getContext()).toEqual({ bar: 'foo' })
  })

  it('should synchronize with local storage on storage events', () => {
    const manager = createStoredContextManager()

    localStorage.setItem(STORAGE_KEY, '{"bar":"foo"}')
    expect(manager.getContext()).toEqual({})

    window.dispatchEvent(createNewEvent(DOM_EVENT.STORAGE, { key: 'unknown' }))
    expect(manager.getContext()).toEqual({})

    window.dispatchEvent(createNewEvent(DOM_EVENT.STORAGE, { key: STORAGE_KEY }))
    expect(manager.getContext()).toEqual({ bar: 'foo' })
  })

  it('should update local storage on context updates', () => {
    const manager = createStoredContextManager()
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

  it('merges local storage data with initial context', () => {
    localStorage.setItem(STORAGE_KEY, '{"bar":"foo"}')
    const manager = createStoredContextManager({ initialContext: { qux: 'qix' } })

    expect(manager.getContext()).toEqual({ bar: 'foo', qux: 'qix' })
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{"bar":"foo","qux":"qix"}')
  })

  it('should store different product data in different storage key', () => {
    createStoredContextManager({ initialContext: { bar: 'foo' }, productKey: 'p1' })
    createStoredContextManager({ initialContext: { qux: 'qix' }, productKey: 'p2' })

    expect(localStorage.getItem(buildStorageKey('p1', CUSTOMER_DATA_TYPE))).toBe('{"bar":"foo"}')
    expect(localStorage.getItem(buildStorageKey('p2', CUSTOMER_DATA_TYPE))).toBe('{"qux":"qix"}')
  })

  it('should store different data type in different storage key', () => {
    createStoredContextManager({ initialContext: { bar: 'foo' }, customerDataType: CustomerDataType.User })
    createStoredContextManager({ initialContext: { qux: 'qix' }, customerDataType: CustomerDataType.GlobalContext })

    expect(localStorage.getItem(buildStorageKey(PRODUCT_KEY, CustomerDataType.User))).toBe('{"bar":"foo"}')
    expect(localStorage.getItem(buildStorageKey(PRODUCT_KEY, CustomerDataType.GlobalContext))).toBe('{"qux":"qix"}')
  })

  function createStoredContextManager({
    initialContext,
    productKey = PRODUCT_KEY,
    customerDataType = CUSTOMER_DATA_TYPE,
  }: {
    initialContext?: Context
    productKey?: string
    customerDataType?: CustomerDataType
  } = {}) {
    const manager = createContextManager('test', { customerDataTracker: createCustomerDataTracker(noop) })
    if (initialContext) {
      manager.setContext(initialContext)
    }
    storeContextManager(configuration, manager, productKey, customerDataType)
    return manager
  }
})
