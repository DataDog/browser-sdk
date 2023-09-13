import { computeBytesCount } from '../../tools/utils/byteUtils'
import { addEventListener, DOM_EVENT } from '../../browser/addEventListener'
import type { Context } from '../../tools/serialisation/context'
import type { Configuration } from '../configuration'
import type { ContextManager } from './contextManager'
import { createContextManager } from './contextManager'
import type { CustomerDataType } from './contextConstants'

const CONTEXT_STORE_KEY_PREFIX = '_dd_c'

const storageListeners: Array<{ stop: () => void }> = []

export function createStoredContextManager(
  configuration: Configuration,
  productKey: string,
  customerDataType: CustomerDataType,
  computeBytesCountImpl = computeBytesCount
): ContextManager {
  const storageKey = buildStorageKey(productKey, customerDataType)
  const contextManager = createContextManager(customerDataType, computeBytesCountImpl)

  synchronizeWithStorage()
  storageListeners.push(
    addEventListener(configuration, window, DOM_EVENT.STORAGE, ({ key }) => {
      if (storageKey === key) {
        synchronizeWithStorage()
      }
    })
  )
  contextManager.changeObservable.subscribe(dumpToStorage)

  return contextManager

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

export function removeStorageListeners() {
  storageListeners.map((listener) => listener.stop())
}
