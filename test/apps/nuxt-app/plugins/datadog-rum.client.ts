import { datadogRum } from '@datadog/browser-rum'
import { nuxtRumPlugin } from '@datadog/browser-rum-nuxt'
import { defineNuxtPlugin, useRoute, useRouter } from 'nuxt/app'

export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const rumConfigParam = route.query['rum-config']

  if (rumConfigParam) {
    const raw = Array.isArray(rumConfigParam) ? rumConfigParam[0] : rumConfigParam
    if (raw) {
      const config = JSON.parse(raw)
      datadogRum.init({ ...config, plugins: [nuxtRumPlugin({ router: useRouter(), nuxtApp })] })
    }
  }
})
