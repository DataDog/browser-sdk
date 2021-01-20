import { useEffect, useReducer } from 'react'
import { Store } from '../common/types'
import { listenAction, sendAction } from './actions'

let store: Store | undefined
const storeListeners = new Set<() => void>()
const storeLoadingPromise = new Promise((resolve) => {
  sendAction('getStore', undefined)
  listenAction('newStore', (newStore) => {
    store = newStore
    storeListeners.forEach((listener) => listener())
    resolve()
  })
})

export function useStore(): [Store, (newState: Partial<Store>) => void] {
  if (!store) {
    throw storeLoadingPromise
  }

  const forceUpdate = useReducer(() => ({}), {})[1] as () => void

  useEffect(() => {
    storeListeners.add(forceUpdate)
    return () => {
      storeListeners.delete(forceUpdate)
    }
  }, [])

  return [store, setStore]
}

function setStore(newStore: Partial<Store>) {
  sendAction('setStore', newStore)
}
