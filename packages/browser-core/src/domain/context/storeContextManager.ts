import { combine } from '@datadog/js-core/util'
import { addEventListener, DOM_EVENT } from '../../browser/addEventListener'
import type { Context } from '../../tools/serialisation/context'
import { isEmptyObject, tryJsonParse } from '../../tools/utils/objectUtils'
import type { ContextManager } from './contextManager'
import type { CustomerDataType } from './contextConstants'

const CONTEXT_STORE_KEY_PREFIX = '_dd_c'

const storageListeners: Array<{ stop: () => void }> = []

export function storeContextManager(
  contextManager: ContextManager,
  productKey: string,
  customerDataType: CustomerDataType
) {
  // window and localStorage are not available in Web Workers or Node.js environments
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return
  }

  const storageKey = buildStorageKey(productKey, customerDataType)

  storageListeners.push(
    addEventListener(window, DOM_EVENT.STORAGE, ({ key }) => {
      if (storageKey === key) {
        synchronizeWithStorage()
      }
    })
  )
  contextManager.changeObservable.subscribe(dumpToStorage)

  const contextFromStorage = combine(getFromStorage(), contextManager.getContext())
  if (!isEmptyObject(contextFromStorage)) {
    contextManager.setContext(contextFromStorage)
  }

  function synchronizeWithStorage() {
    contextManager.setContext(getFromStorage())
  }

  function dumpToStorage() {
    localStorage.setItem(storageKey, JSON.stringify(contextManager.getContext()))
  }

  function getFromStorage() {
    const rawContext = localStorage.getItem(storageKey)
    return rawContext ? (tryJsonParse<Context>(rawContext) ?? {}) : {}
  }
}

export function buildStorageKey(productKey: string, customerDataType: CustomerDataType) {
  return `${CONTEXT_STORE_KEY_PREFIX}_${productKey}_${customerDataType}`
}

export function removeStorageListeners() {
  storageListeners.map((listener) => listener.stop())
}
