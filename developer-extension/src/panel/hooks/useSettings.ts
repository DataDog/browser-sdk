import { useEffect, useReducer } from 'react'
import { EventListeners } from '../../common/eventListeners'
import { createLogger } from '../../common/logger'
import type { EventSource } from '../types'

const logger = createLogger('useSettings')

export interface Settings {
  useDevBundles: boolean
  useRumSlim: boolean
  blockIntakeRequests: boolean
  autoFlush: boolean
  preserveEvents: boolean
  eventSource: EventSource
}

const DEFAULT_SETTINGS: Readonly<Settings> = {
  useDevBundles: false,
  useRumSlim: false,
  blockIntakeRequests: false,
  autoFlush: false,
  preserveEvents: false,
  eventSource: 'sdk',
}

let settings: Settings | undefined
const onSettingsChange = new EventListeners()
const storageLoadingPromise = loadSettingsFromStorage().catch((error) =>
  logger.error('Error while loading extension storage', error)
)

async function loadSettingsFromStorage() {
  const storage = await chrome.storage.local.get()
  settings = Object.fromEntries(
    Object.entries(DEFAULT_SETTINGS).map(([name, defaultValue]) => [name, storage[name] ?? defaultValue])
  ) as Settings
}

function setSetting<Name extends keyof Settings>(name: Name, value: Settings[Name]) {
  settings![name] = value
  onSettingsChange.notify()
  chrome.storage.local
    .set({ [name]: value })
    .catch((error) => logger.error('Error while storing setting to the storage', error))
}

export function useSettings() {
  if (!settings) {
    throw storageLoadingPromise
  }

  // https://legacy.reactjs.org/docs/hooks-faq.html#is-there-something-like-forceupdate
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    const subscription = onSettingsChange.subscribe(forceUpdate)
    return () => subscription.unsubscribe()
  }, [])

  return [settings, setSetting] as const
}
