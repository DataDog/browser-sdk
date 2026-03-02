import { HookNames } from '../../tools/abstractHooks'
import type { AbstractHooks } from '../../tools/abstractHooks'
import { mockable } from '../../tools/mockable'
import { generateUUID } from '../../tools/utils/stringUtils'

export const TAB_ID_STORAGE_KEY = '_dd_tab_id'

// Cached fallback ID for environments where sessionStorage is unavailable (e.g. sandboxed
// iframes, Web Workers). Ensures RUM and Logs share the same tab ID within a page lifecycle
// even when storage access throws.
let fallbackTabId: string | undefined

export function startTabContext(hooks: AbstractHooks) {
  const tabId = mockable(retrieveOrCreateTabId)()

  hooks.register(HookNames.Assemble, () => ({
    tab: {
      id: tabId,
    },
  }))
}

export function retrieveOrCreateTabId(): string {
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
    if (!fallbackTabId) {
      fallbackTabId = generateUUID()
    }
    return fallbackTabId
  }
}
