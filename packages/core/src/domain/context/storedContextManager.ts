import { computeBytesCount } from '../../tools/utils/byteUtils'
import { addEventListener, DOM_EVENT } from '../../browser/addEventListener'
import type { Context } from '../../tools/serialisation/context'
import type { Configuration } from '../configuration'
import type { ContextManager } from './contextManager'
import { createContextManager } from './contextManager'
import type { CustomerDataType } from './contextConstants'

const CONTEXT_STORE_KEY_PREFIX = '_dd_c'

export function createStoredContextManager(
  configuration: Configuration,
  productKey: string,
  customerDataType: CustomerDataType,
  computeBytesCountImpl = computeBytesCount
): ContextManager {
  const storageKey = buildStorageKey(productKey, customerDataType)
  const contextManager = createContextManager(customerDataType, computeBytesCountImpl)

  synchronizeWithStorage()
  addEventListener(configuration, window, DOM_EVENT.STORAGE, ({ key }) => {
    if (storageKey === key) {
      synchronizeWithStorage()
    }
  })

  return {
    getBytesCount: contextManager.getBytesCount,

    /** @deprecated use getContext instead */
    get: () => contextManager.get(),

    /** @deprecated use setContextProperty instead */
    add: (key: string, value: any) => {
      contextManager.add(key, value)
      dumpToStorage()
    },

    /** @deprecated renamed to removeContextProperty */
    remove: (key: string) => {
      contextManager.remove(key)
      dumpToStorage()
    },

    /** @deprecated use setContext instead */
    set: (newContext: object) => {
      contextManager.set(newContext)
      dumpToStorage()
    },

    getContext: () => contextManager.getContext(),

    setContext: (newContext: Context) => {
      contextManager.setContext(newContext)
      dumpToStorage()
    },

    setContextProperty: (key: string, property: any) => {
      contextManager.setContextProperty(key, property)
      dumpToStorage()
    },

    removeContextProperty: (key: string) => {
      contextManager.removeContextProperty(key)
      dumpToStorage()
    },

    clearContext: () => {
      contextManager.clearContext()
      dumpToStorage()
    },
  }

  function synchronizeWithStorage() {
    const rawContext = localStorage.getItem(storageKey)
    const context = rawContext !== null ? (JSON.parse(rawContext) as Context) : {}
    contextManager.setContext(context)
  }

  function dumpToStorage() {
    localStorage.setItem(storageKey, JSON.stringify(contextManager.getContext()))
  }
}

export function buildStorageKey(productKey: string, customerDataType: CustomerDataType) {
  return `${CONTEXT_STORE_KEY_PREFIX}_${productKey}_${customerDataType}`
}
