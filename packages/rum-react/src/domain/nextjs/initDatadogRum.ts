// Work in progress, not tested yet.

// import type { RumPublicApi } from '@datadog/browser-rum-core'
// import { addEventListener } from '@datadog/browser-core'
// import { reactPlugin } from '../reactPlugin'
// import type { NextjsRumConfig } from './types'

// /**
//  * Helper for Next.js instrumentation file (instrumentation-client.ts).
//  * Initializes RUM with Next.js integration enabled and optional early error capture.
//  *
//  * @param config - Configuration for Next.js RUM integration
//  * @param datadogRum - The datadogRum instance from @datadog/browser-rum
//  * @example
//  * ```ts
//  * // instrumentation-client.ts
//  * import { datadogRum } from '@datadog/browser-rum'
//  * import { initDatadogRum } from '@datadog/browser-rum-react/nextjs'
//  *
//  * export function register() {
//  *   initDatadogRum(
//  *     {
//  *       datadogConfig: {
//  *         applicationId: '<ID>',
//  *         clientToken: '<TOKEN>',
//  *         site: 'datadoghq.com',
//  *       },
//  *       nextjsConfig: {
//  *         captureEarlyErrors: true,
//  *       }
//  *     },
//  *     datadogRum
//  *   )
//  * }
//  * ```
//  */
// export function initDatadogRum(config: NextjsRumConfig, datadogRum: RumPublicApi): void {
//   if (typeof window === 'undefined') {
//     // Server-side guard - RUM only runs in the browser
//     return
//   }

//   const { datadogConfig, nextjsConfig } = config

//   // Initialize RUM with the reactPlugin configured for Next.js
//   const nextjsPlugin = reactPlugin({ nextjs: true })
//   const existingPlugins = (datadogConfig.plugins || []) as Array<typeof nextjsPlugin>

//   datadogRum.init({
//     ...datadogConfig,
//     plugins: [nextjsPlugin].concat(existingPlugins),
//   })

//   // Optional: Set up early error capture
//   if (nextjsConfig?.captureEarlyErrors) {
//     addEventListener({}, window, 'error', (event) => {
//       datadogRum.addError(event.error)
//     })

//     addEventListener({}, window, 'unhandledrejection', (event: PromiseRejectionEvent) => {
//       datadogRum.addError(event.reason)
//     })
//   }
// }
