import { useEffect, useReducer } from 'react'
import { SESSION_STORAGE_SETTINGS_KEY } from '../../common/sessionKeyConstant'
import { EventListeners } from '../../common/eventListeners'
import { createLogger } from '../../common/logger'
import { evalInWindow } from '../evalInWindow'
import type { Settings } from '../../common/extension.types'

const logger = createLogger('useSettings')

const DEFAULT_SETTINGS: Readonly<Settings> = {
  useDevBundles: false,
  useRumSlim: false,
  blockIntakeRequests: false,
  autoFlush: false,
  preserveEvents: false,
  eventCollectionStrategy: 'sdk',
  rumConfigurationOverride: null,
  logsConfigurationOverride: null,
  debugMode: false,
}

let settings: Settings | undefined
const onSettingsChange = new EventListeners()
const storageLoadingPromise = loadSettingsFromStorage().catch((error) =>
  logger.error('Error while loading extension storage', error)
)

function syncSettingsWithSessionStorage(settings: Settings) {
  evalInWindow(`sessionStorage.setItem(
    ${JSON.stringify(SESSION_STORAGE_SETTINGS_KEY)},
    ${JSON.stringify(JSON.stringify(settings))})
  `).catch((error) => logger.error('Error while synchronizing session storage with extension storage', error))
}

async function loadSettingsFromStorage() {
  const storage = await chrome.storage.local.get()
  settings = Object.fromEntries(
    Object.entries(DEFAULT_SETTINGS).map(([name, defaultValue]) => [name, storage[name] ?? defaultValue])
  ) as Settings
  if (settings) {
    syncSettingsWithSessionStorage(settings)
  }
}

function setSetting<Name extends keyof Settings>(name: Name, value: Settings[Name]) {
  settings![name] = value
  onSettingsChange.notify()
  chrome.storage.local
    .set({ [name]: value })
    .catch((error) => logger.error('Error while storing setting to the storage', error))
  if (settings) {
    syncSettingsWithSessionStorage(settings)
  }
}

export function useSettings() {
  // If we don't have settings yet, it means that we are still loading them from the storage. Throw
  // the promise so it'll be caught by the Suspense boundary.
  if (!settings) {
    throw storageLoadingPromise
  }

  // We want to have a single 'settings' object shared between all components (it's easier to have
  // a single source of truth and simplifies persistence implementation). Usually, we would use
  // something like redux or one of the many other alternatives. Since we have a single use-case in
  // this project, let's implement a shared state manually by forcing an update when the 'settings'
  // object changes.

  // https://legacy.reactjs.org/docs/hooks-faq.html#is-there-something-like-forceupdate
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  useEffect(() => {
    const subscription = onSettingsChange.subscribe(forceUpdate)
    return () => subscription.unsubscribe()
  }, [])

  return [settings, setSetting] as const
}
