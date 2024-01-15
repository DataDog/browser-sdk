import { addEventListener, DOM_EVENT } from '../../browser/addEventListener'
import type { Context } from '../../tools/serialisation/context'
import type { Configuration } from '../configuration'
import { combine } from '../../tools/mergeInto'
import type { ContextManager } from './contextManager'
import type { CustomerDataType } from './contextConstants'

const CONTEXT_STORE_KEY_PREFIX = '_dd_c'

const storageListeners: Array<{ stop: () => void }> = []

export function storeContextManager(
  configuration: Configuration,
  contextManager: ContextManager,
  productKey: string,
  customerDataType: CustomerDataType
) {
  const storageKey = buildStorageKey(productKey, customerDataType)

  storageListeners.push(
    addEventListener(configuration, window, DOM_EVENT.STORAGE, ({ key }) => {
      if (storageKey === key) {
        synchronizeWithStorage()
      }
    })
  )
  contextManager.changeObservable.subscribe(dumpToStorage)

  contextManager.setContext(combine(getFromStorage(), contextManager.getContext()))

  function synchronizeWithStorage() {
    contextManager.setContext(getFromStorage())
  }

  function dumpToStorage() {
    localStorage.setItem(storageKey, JSON.stringify(contextManager.getContext()))
  }

  function getFromStorage() {
    const rawContext = localStorage.getItem(storageKey)
    return rawContext !== null ? (JSON.parse(rawContext) as Context) : {}
  }
}

export function buildStorageKey(productKey: string, customerDataType: CustomerDataType) {
  return `${CONTEXT_STORE_KEY_PREFIX}_${productKey}_${customerDataType}`
}

export function removeStorageListeners() {
  storageListeners.map((listener) => listener.stop())
}
