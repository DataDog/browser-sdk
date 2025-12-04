import type { ContextManager } from '@datadog/browser-core'
import { dateNow, display, setInterval } from '@datadog/browser-core'
import { sendLiveDebuggerLog } from './liveDebuggerLogger'
import type { FirebaseConfig } from './initializeFirebase'
import { initializeFirebase } from './initializeFirebase'

interface FirebaseRemoteConfigValue {
  asBoolean(): boolean
  asString(): string
  getSource?(): string
}

interface FirebaseRemoteConfig {
  getValue(key: string): FirebaseRemoteConfigValue
  getBoolean?(key: string): boolean
  onConfigUpdated?(callback: () => void): void
  ensureInitialized(): Promise<void>
  fetchAndActivate?(): Promise<boolean>
  settings?: {
    minimumFetchIntervalMillis?: number
  }
  defaultConfig?: Record<string, string | boolean>
}

interface Firebase {
  remoteConfig: () => FirebaseRemoteConfig
}

interface BrowserWindow extends Window {
  firebase?: Firebase
}

/**
 * Start Firebase Remote Config integration for live debugger.
 * This function initializes Firebase Remote Config, listens to config changes,
 * and sets global context properties in `dd_<id>` format.
 *
 * @param globalContext - The global context manager to set properties on
 * @param liveDebuggerId - The ID to use for the global context property key
 * @param firebaseConfig - Optional Firebase configuration. If provided, the SDK will initialize Firebase automatically.
 * @param firebaseVersion - Optional Firebase SDK version to load (defaults to '10.7.1')
 * @returns A promise that resolves when initialization is complete
 */
export async function startFirebaseRemoteConfigIntegration(
  globalContext: ContextManager,
  liveDebuggerId: string,
  firebaseConfig?: FirebaseConfig,
  firebaseVersion?: string
): Promise<void> {
  // Initialize Firebase if config is provided
  if (firebaseConfig) {
    try {
      await initializeFirebase(firebaseConfig, firebaseVersion)
    } catch (error) {
      display.error(`Failed to initialize Firebase: ${String(error)}`)
      throw error
    }
  }

  const browserWindow = window as BrowserWindow

  if (!browserWindow.firebase) {
    throw new Error('Firebase SDK is not available. Please include Firebase SDK before initializing the RUM SDK or provide firebaseConfig.')
  }

  if (!browserWindow.firebase.remoteConfig) {
    throw new Error('Firebase Remote Config is not available. Please include Firebase Remote Config SDK.')
  }

  try {
    const remoteConfig = browserWindow.firebase.remoteConfig()

    // Set minimum fetch interval to 0 for development (no cache)
    // Note: Firebase enforces a minimum of 60 seconds in production
    if (remoteConfig.settings) {
      remoteConfig.settings.minimumFetchIntervalMillis = 0
    }

    // Ensure Remote Config is initialized
    await remoteConfig.ensureInitialized()

    // Function to update the global context property and send log
    const updateContextAndLog = () => {
      try {
        const configValue = remoteConfig.getValue(`dd_${liveDebuggerId}`)
        
        // Get string value first - Firebase Remote Config stores values as strings
        const stringValue = configValue.asString()
        let booleanValue: boolean
        
        // Firebase Remote Config asBoolean() can be unreliable for string values
        // Parse the string value explicitly to handle "true"/"false" strings
        const normalizedString = stringValue.toLowerCase().trim()
        if (normalizedString === 'true' || normalizedString === '1') {
          booleanValue = true
        } else if (normalizedString === 'false' || normalizedString === '0' || normalizedString === '') {
          booleanValue = false
        } else {
          // Try asBoolean() as fallback, but log a warning if it seems wrong
          booleanValue = configValue.asBoolean()
          if (normalizedString !== 'true' && normalizedString !== 'false' && booleanValue) {
            display.warn(`Firebase Remote Config value "${stringValue}" for key "${liveDebuggerId}" converted to boolean ${booleanValue}`)
          }
        }

        // Set global context property with dd_<id> format
        globalContext.setContextProperty(`dd_${liveDebuggerId}`, booleanValue)

        // Send log event
        sendLiveDebuggerLog({
          key: liveDebuggerId,
          value: booleanValue,
          id: liveDebuggerId,
          timestamp: dateNow(),
          stringValue,
        })

        /// TODO SOME LOGIC ON THE VALUE OF THE CONFIG

        /// TODO END OF LOGIC ON THE VALUE OF THE CONFIG
      } catch (error) {
        display.error(`Error updating live debugger context: ${String(error)}`)
      }
    }

    // Set initial value
    updateContextAndLog()

    // Fetch initial config from server
    if (remoteConfig.fetchAndActivate) {
      try {
        await remoteConfig.fetchAndActivate()
        updateContextAndLog()
      } catch (error) {
        display.warn(`Failed to fetch initial Firebase Remote Config: ${String(error)}`)
      }
    }

    // Set up config update listener
    // Note: onConfigUpdated only fires when fetchAndActivate() is called and new config is available
    // So we need to periodically fetch to detect changes
    if (typeof remoteConfig.onConfigUpdated === 'function') {
      remoteConfig.onConfigUpdated(() => {
        updateContextAndLog()
      })
    }

    // Periodically fetch config updates
    // Use shorter interval for development (when minimumFetchIntervalMillis is 0)
    // In production, Firebase will enforce minimum 60 seconds regardless
    const fetchInterval = 10000 // 10 seconds - Firebase will enforce its own minimum in production
    setInterval(() => {
      // Use void to explicitly ignore the promise return value
      void (async () => {
        try {
          if (remoteConfig.fetchAndActivate) {
            const activated = await remoteConfig.fetchAndActivate()
            if (activated) {
              // Config was activated, onConfigUpdated callback will fire and updateContextAndLog will be called
              // But we also call it here to ensure updates happen even if callback isn't available
              updateContextAndLog()
            }
          }
        } catch {
          // Silently handle fetch errors - Firebase may rate limit or reject requests if too frequent
          // The error is expected when minimumFetchIntervalMillis hasn't elapsed
        }
      })()
    }, fetchInterval)
  } catch (error) {
    display.error(`Failed to initialize Firebase Remote Config integration: ${String(error)}`)
    throw error
  }
}

