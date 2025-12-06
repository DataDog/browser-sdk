import { display } from '@datadog/browser-core'

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId: string
  measurementId?: string
}

interface FirebaseApp {
  name?: string
  options?: {
    projectId?: string
  }
}

interface FirebaseNamespace {
  initializeApp: (config: FirebaseConfig) => FirebaseApp
  apps?: FirebaseApp[]
  remoteConfig: () => any
}

interface BrowserWindow extends Window {
  firebase?: FirebaseNamespace
}

/**
 * Load Firebase SDK scripts dynamically
 */
function loadFirebaseScripts(version: string = '10.7.1'): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if Firebase is already loaded
    if ((window as BrowserWindow).firebase) {
      resolve()
      return
    }

    const scripts = [
      `https://www.gstatic.com/firebasejs/${version}/firebase-app-compat.js`,
      `https://www.gstatic.com/firebasejs/${version}/firebase-remote-config-compat.js`,
    ]

    let loadedCount = 0
    const totalScripts = scripts.length
    let hasError = false

    scripts.forEach((src) => {
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.onload = () => {
        if (!hasError) {
          loadedCount++
          if (loadedCount === totalScripts) {
            resolve()
          }
        }
      }
      script.onerror = () => {
        hasError = true
        reject(new Error(`Failed to load Firebase script: ${src}`))
      }
      document.head.appendChild(script)
    })
  })
}

/**
 * Initialize Firebase Remote Config with the provided configuration
 */
export async function initializeFirebase(firebaseConfig: FirebaseConfig, firebaseVersion?: string): Promise<void> {
  const browserWindow = window as BrowserWindow
  const version = firebaseVersion || '10.7.1'

  // Load Firebase SDK scripts if not already loaded
  if (!browserWindow.firebase) {
    try {
      await loadFirebaseScripts(version)
    } catch (error) {
      display.error(`Failed to load Firebase SDK: ${String(error)}`)
      throw error
    }
  }

  // Check if Firebase is available after loading
  if (!browserWindow.firebase) {
    throw new Error('Firebase SDK failed to load')
  }

  // Initialize Firebase app if not already initialized
  try {
    // Check if Firebase app is already initialized for this project
    const existingApps = browserWindow.firebase.apps || []
    const isAlreadyInitialized = existingApps.some(
      (app: FirebaseApp) => app?.options?.projectId === firebaseConfig.projectId
    )

    if (!isAlreadyInitialized) {
      browserWindow.firebase.initializeApp(firebaseConfig)
      display.log('Firebase initialized successfully')
    } else {
      display.log('Firebase app already initialized for this project')
    }
  } catch (error: any) {
    // Firebase might already be initialized, which is fine
    // Check if it's a duplicate app error
    if (error?.code === 'app/duplicate-app') {
      display.log('Firebase app already initialized')
    } else {
      display.debug(`Firebase initialization note: ${String(error)}`)
    }
  }

  // Verify Firebase Remote Config is available
  if (!browserWindow.firebase.remoteConfig) {
    throw new Error('Firebase Remote Config is not available after initialization')
  }
}
