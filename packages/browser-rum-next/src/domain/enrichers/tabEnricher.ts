const TAB_ID_STORAGE_KEY = '_dd_tab_id'

let cachedTabId: string | undefined

function getTabId(): string {
  if (!cachedTabId) {
    cachedTabId = getOrCreateFromSessionStorage() ?? generateId()
  }
  return cachedTabId
}

function getOrCreateFromSessionStorage(): string | undefined {
  try {
    const existing = sessionStorage.getItem(TAB_ID_STORAGE_KEY)
    if (existing) {
      return existing
    }
    const id = generateId()
    sessionStorage.setItem(TAB_ID_STORAGE_KEY, id)
    return id
  } catch {
    return undefined
  }
}

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}

function tabEnricher() {
  const tabId = getTabId()

  return {
    name: 'tab',
    transform(data: Record<string, unknown>) {
      return {
        ...data,
        tab: { id: tabId },
      }
    },
  }
}

export { tabEnricher }
