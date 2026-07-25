/**
 * Vue Router v4 integration.
 *
 * @packageDocumentation
 * @example
 * ```ts
 * import { createApp } from 'vue'
 * import { datadogRum } from '@datadog/browser-rum'
 * import { vuePlugin } from '@datadog/browser-rum-vue'
 *
 * // ⚠️ Use "createRouter" from `@datadog/browser-rum-vue/vue-router-v4` instead of `vue-router`
 * import { createRouter } from '@datadog/browser-rum-vue/vue-router-v4'
 *
 * datadogRum.init({
 *   applicationId: '<DATADOG_APPLICATION_ID>',
 *   clientToken: '<DATADOG_CLIENT_TOKEN>',
 *   site: '<DATADOG_SITE>',
 *   plugins: [vuePlugin({ router: true })],
 *   // ...
 * })
 *
 * const router = createRouter({
 *   routes: [
 *     // ...
 *   ],
 * })
 *
 * const app = createApp(App)
 * app.use(router)
 * ```
 */
export { createRouter } from '../domain/router/vueRouter'
