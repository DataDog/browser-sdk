import { buildUrl } from '@datadog/js-core/util'
import type { RumPlugin, RumPublicApi, StartRumResult } from '@datadog/browser-rum-core'

/**
 * Next.js plugin type.
 *
 * The plugins API is unstable and experimental, and may change without notice. Please don't use this type directly.
 *
 * @internal
 */
export type NextjsPlugin = Pick<Required<RumPlugin>, 'name' | 'onInit' | 'onRumStart'>

type InitSubscriber = (rumPublicApi: RumPublicApi) => void
type StartSubscriber = (addError: StartRumResult['addError']) => void

let globalPublicApi: RumPublicApi | undefined
let globalAddError: StartRumResult['addError'] | undefined
let lastNavigationUrl: string | undefined

const onRumInitSubscribers: InitSubscriber[] = []
const onRumStartSubscribers: StartSubscriber[] = []

/**
 * Next.js plugin constructor.
 *
 * @category Main
 * @example
 * ```ts
 * // instrumentation-client.js
 * import { datadogRum } from '@datadog/browser-rum'
 * import { nextjsPlugin, onRouterTransitionStart } from '@datadog/browser-rum-nextjs'
 *
 * // Only needed for the App Router, so Next.js can call it on client-side navigations
 * export { onRouterTransitionStart }
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   plugins: [nextjsPlugin()],
 *   // ...
 * })
 * ```
 */
export function nextjsPlugin(): NextjsPlugin {
  return {
    name: 'nextjs',
    onInit({ publicApi, initConfiguration }) {
      globalPublicApi = publicApi
      initConfiguration.trackViewsManually = true

      for (const subscriber of onRumInitSubscribers) {
        subscriber(publicApi)
      }
    },
    onRumStart({ addError }) {
      globalAddError = addError
      if (addError) {
        for (const subscriber of onRumStartSubscribers) {
          subscriber(addError)
        }
      }
    },
  } satisfies RumPlugin
}

export function startNextjsView(viewName: string) {
  if (globalPublicApi) {
    // Use the URL captured by onRouterTransitionStart if available, since React renders before pushState updates window.location
    const url = lastNavigationUrl ? buildUrl(lastNavigationUrl, window.location.origin).href : undefined
    lastNavigationUrl = undefined
    globalPublicApi.startView({ name: viewName, url })
  }
}

/**
 * Notifies the plugin that an App Router navigation has started, so the target URL can be
 * captured before React renders and `window.location` updates.
 *
 * Must be re-exported from the user's `instrumentation-client.js` so Next.js can call it on
 * client-side navigations. Only needed for the App Router; the Pages Router doesn't use it.
 *
 * @category Main
 * @example
 * ```ts
 * // instrumentation-client.js
 * import { onRouterTransitionStart } from '@datadog/browser-rum-nextjs'
 *
 * export { onRouterTransitionStart }
 * ```
 */
export function onRouterTransitionStart(url: string) {
  lastNavigationUrl = url
}

export function onRumInit(callback: InitSubscriber) {
  if (globalPublicApi) {
    callback(globalPublicApi)
  } else {
    onRumInitSubscribers.push(callback)
  }
}

export function onRumStart(callback: StartSubscriber) {
  if (globalAddError) {
    callback(globalAddError)
  } else {
    onRumStartSubscribers.push(callback)
  }
}

export function resetNextjsPlugin() {
  globalPublicApi = undefined
  globalAddError = undefined
  onRumInitSubscribers.length = 0
  onRumStartSubscribers.length = 0
  lastNavigationUrl = undefined
}
