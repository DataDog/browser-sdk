import { datadogRum } from '@datadog/browser-rum'
import { nuxtRumPlugin, startTrackingNuxtViews, addNuxtError } from '@datadog/browser-rum-nuxt'

export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const rumConfigParam = route.query['rum-config']

  if (!datadogRum.getInitConfiguration() && rumConfigParam) {
    const raw = Array.isArray(rumConfigParam) ? rumConfigParam[0] : rumConfigParam
    if (raw) {
      datadogRum.init({ ...JSON.parse(raw), plugins: [nuxtRumPlugin()] })
    }
  }

  startTrackingNuxtViews(useRouter())

  nuxtApp.hook('vue:error', (error, instance, info) => {
    addNuxtError(error, instance, info)
  })
})
