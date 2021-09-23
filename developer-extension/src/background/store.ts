import { Store } from '../common/types'
import { listenAction, sendAction } from './actions'

export const store: Store = {
  devServerStatus: 'checking',
  logEventsFromRequests: true,
  useDevBundles: false,
  useRumSlim: false,
}

export function setStore(newStore: Partial<Store>) {
  if (wouldModifyStore(newStore)) {
    Object.assign(store, newStore)
    sendAction('newStore', store)
    chrome.storage.local.set({ store })
  }
}

listenAction('getStore', () => sendAction('newStore', store))
listenAction('setStore', (newStore) => setStore(newStore))

chrome.storage.local.get((storage) => {
  if (storage.store) {
    setStore(storage.store as Store)
  }
})

function wouldModifyStore(newStore: Partial<Store>) {
  return (Object.entries(newStore) as Array<[keyof Store, unknown]>).some(([key, value]) => store[key] !== value)
}
