import type { Hook } from '@openobserve/js-core/assembly'
import { generateUUID } from '../../tools/utils/stringUtils'

export const TAB_ID_STORAGE_KEY = '_oo_tab_id'

let cachedTabId: string | undefined

// Exported for test cleanup only — allows specs to reset the in-memory cache between tests.
export function resetCachedTabId(): void {
  cachedTabId = undefined
}

export function startTabContext(assembleHook: Hook<any, any>) {
  const tabId = retrieveOrCreateTabId()

  assembleHook.register(() => ({
    tab: {
      id: tabId,
    },
  }))
}

function retrieveOrCreateTabId(): string {
  if (!cachedTabId) {
    cachedTabId = getOrCreateIdInSessionStorage() ?? generateUUID()
  }
  return cachedTabId
}

function getOrCreateIdInSessionStorage(): string | undefined {
  try {
    const existingId = sessionStorage.getItem(TAB_ID_STORAGE_KEY)
    if (existingId) {
      return existingId
    }
    const newId = generateUUID()
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, newId)
    return newId
  } catch {
    // sessionStorage unavailable (e.g. Web Worker, sandboxed iframe, quota exceeded)
    return undefined
  }
}
