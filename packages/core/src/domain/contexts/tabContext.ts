import { HookNames } from '../../tools/abstractHooks'
import type { AbstractHooks } from '../../tools/abstractHooks'
import { generateUUID } from '../../tools/utils/stringUtils'

const TAB_ID_STORAGE_KEY = '_dd_tab_id'

export function startTabContext(hooks: AbstractHooks) {
  const tabId = retrieveOrCreateTabId()

  hooks.register(HookNames.Assemble, () => ({
    _dd: {
      browser_tab_id: tabId,
    },
  }))

  return {
    getTabId: () => tabId,
  }
}

function retrieveOrCreateTabId(): string {
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
    return generateUUID()
  }
}
