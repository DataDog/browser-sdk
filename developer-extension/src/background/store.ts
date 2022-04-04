import type { Store, LocalStore } from '../common/types'
import { listenAction, sendAction } from './actions'

export const store: Store = {
  devServerStatus: 'checking',
  useDevBundles: false,
  useRumSlim: false,
  blockIntakeRequests: false,
  local: {},
}

export function setStore(newStore: Partial<Store>) {
  if (wouldModifyStore(newStore, store)) {
    Object.assign(store, newStore)
    sendAction('newStore', store)
    void chrome.storage.local.set({ store })
  }
}

export function setLocalStore(newStore: Partial<LocalStore>, tabId: number) {
  if (!store.local[tabId]) {
    store.local[tabId] = {
      rumConfig: {},
      logsConfig: {},
    }
  }
  const localStore = store.local[tabId]
  if (wouldModifyStore(newStore, localStore)) {
    Object.assign(localStore, newStore)
    sendAction('newStore', store)
    void chrome.storage.local.set({ store })
  }
}

listenAction('getStore', () => sendAction('newStore', store))
listenAction('setStore', (newStore) => setStore(newStore))

chrome.storage.local.get((storage) => {
  if (storage.store) {
    setStore(storage.store as Store)
  }
})

function wouldModifyStore<S>(newStore: Partial<S>, targetStore: S) {
  return (Object.entries(newStore) as Array<[keyof S, unknown]>).some(([key, value]) => targetStore[key] !== value)
}
