import type { Store } from '../common/types'
import { onDevtoolsMessage, sendMessageToAllDevtools } from './devtoolsPanelConnection'

export const store: Store = {
  useDevBundles: false,
  useRumSlim: false,
  blockIntakeRequests: false,
}

export function setStore(newStore: Partial<Store>) {
  if (wouldModifyStore(newStore, store)) {
    Object.assign(store, newStore)
    sendMessageToAllDevtools({ type: 'new-store', store })
    void chrome.storage.local.set({ store })
  }
}

onDevtoolsMessage.subscribe((message) => {
  switch (message.type) {
    case 'get-store':
      sendMessageToAllDevtools({ type: 'new-store', store })
      break

    case 'set-store':
      setStore(message.store)
      break
  }
})

chrome.storage.local.get((storage) => {
  if (storage.store) {
    setStore(storage.store as Store)
  }
})

function wouldModifyStore<S>(newStore: Partial<S>, targetStore: S) {
  return (Object.entries(newStore) as Array<[keyof S, unknown]>).some(([key, value]) => targetStore[key] !== value)
}
