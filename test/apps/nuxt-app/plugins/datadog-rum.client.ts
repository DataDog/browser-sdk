import { datadogRum } from '@datadog/browser-rum'
import { addNuxtAppError, addNuxtError, nuxtRumPlugin } from '@datadog/browser-rum-nuxt'
import { defineNuxtPlugin, useRoute, useRouter } from 'nuxt/app'

export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const rumConfigParam = route.query['rum-config']

  if (rumConfigParam) {
    const raw = Array.isArray(rumConfigParam) ? rumConfigParam[0] : rumConfigParam
    if (raw) {
      nuxtApp.hook('app:error', (error) => {
        addNuxtAppError(error)
      })
      nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
        addNuxtError(error, instance, info)
      }

      const config = JSON.parse(raw)
      datadogRum.init({ ...config, plugins: [nuxtRumPlugin(useRouter())] })
    }
  }
})
