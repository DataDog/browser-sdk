import { useEffect, useState } from 'react'
import type { Store } from '../../common/types'
import { onBackgroundMessage, sendMessageToBackground } from '../backgroundScriptConnection'

let store: Store | undefined
const storeListeners = new Set<(store: Store) => void>()
const storeLoadingPromise = new Promise((resolve) => {
  onBackgroundMessage.subscribe((backgroundMessage) => {
    if (backgroundMessage.type === 'new-store') {
      store = backgroundMessage.store
      storeListeners.forEach((listener) => listener(store!))
      resolve(undefined)
    }
  })
  sendMessageToBackground({ type: 'get-store' })
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
  sendMessageToBackground({ type: 'set-store', store: newStore })
}
