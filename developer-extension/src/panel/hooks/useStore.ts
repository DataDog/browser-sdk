import { useEffect, useState } from 'react'
import type { Store } from '../../common/types'
import { listenAction, sendAction } from '../actions'

let store: Store | undefined
const storeListeners = new Set<(store: Store) => void>()
const storeLoadingPromise = new Promise((resolve) => {
  sendAction('getStore', undefined)
  listenAction('newStore', (newStore) => {
    store = newStore
    storeListeners.forEach((listener) => listener(store!))
    resolve(undefined)
  })
})

export function useStore(): [Store, (newState: Partial<Store>) => void] {
  if (!store) {
    throw storeLoadingPromise
  }

  const [localStore, setLocalStore] = useState(store)

  useEffect(() => {
    storeListeners.add(setLocalStore)
    return () => {
      storeListeners.delete(setLocalStore)
    }
  }, [])

  return [localStore, setStore]
}

function setStore(newStore: Partial<Store>) {
  sendAction('setStore', newStore)
}
