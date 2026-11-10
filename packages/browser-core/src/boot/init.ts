import { setDebugMode } from '@datadog/js-core/util'
import { defineGlobal as coreDefineGlobal } from '@datadog/js-core/runtime'
import { display } from '../tools/display'
import type { User } from '../domain/contexts/userContext'
import type { Account } from '../domain/contexts/accountContext'

// replaced at build time
declare const __BUILD_ENV__SDK_VERSION__: string

export interface PublicApi {
  /**
   * Version of the Logs browser SDK
   */
  version: string

  /**
   * For CDN async setup: Early RUM API calls must be wrapped in the `window.DD_RUM.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.
   *
   * See [CDN async setup](https://docs.datadoghq.com/real_user_monitoring/browser/#cdn-async) for further information.
   */
  onReady: (callback: () => void) => void
}

/**
 * Context to set when initializing the SDK. Each property is equivalent to calling the corresponding
 * setter right after `init()`: it overrides any value set before `init()`, and it can be updated
 * later.
 */
export interface InitContext {
  /**
   * User information to set to all events, stored in `@usr`. Equivalent to calling `setUser()` right
   * after `init()`.
   *
   * See [User session](https://docs.datadoghq.com/real_user_monitoring/browser/advanced_configuration/#user-session) for further information.
   */
  user?: (User & { id: string }) | undefined

  /**
   * Account information to set to all events, stored in `@account`. Equivalent to calling
   * `setAccount()` right after `init()`.
   *
   * See [Account](https://docs.datadoghq.com/real_user_monitoring/application_monitoring/browser/advanced_configuration/#account) for further information.
   */
  account?: Account | undefined
}

export function makePublicApi<T extends PublicApi>(stub: Omit<T, keyof PublicApi>): T {
  const publicApi = {
    version: __BUILD_ENV__SDK_VERSION__,
    // This API method is intentionally not monitored, since the only thing executed is the
    // user-provided 'callback'.  All SDK usages executed in the callback should be monitored, and
    // we don't want to interfere with the user uncaught exceptions.
    onReady(callback: () => void) {
      callback()
    },
    ...stub,
  }

  // Add a "hidden" property to set debug mode. We define it that way to hide it
  // as much as possible but of course it's not a real protection.
  Object.defineProperty(publicApi, '_setDebug', {
    get() {
      return setDebugMode
    },
    enumerable: false,
  })

  return publicApi as T
}

export function defineGlobal<Global, Name extends keyof Global>(global: Global, name: Name, api: Global[Name]) {
  coreDefineGlobal(global, name, api, display)
}
