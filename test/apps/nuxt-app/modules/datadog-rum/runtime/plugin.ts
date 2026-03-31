import { datadogRum } from '@datadog/browser-rum'
import { nuxtRumPlugin } from '@datadog/browser-rum-nuxt'

export default defineNuxtPlugin((nuxtApp) => {
  const route = useRoute()
  const rumConfigParam = route.query['rum-config']

  if (!datadogRum.getInitConfiguration() && rumConfigParam) {
    const raw = Array.isArray(rumConfigParam) ? rumConfigParam[0] : rumConfigParam
    if (raw) {
      const config = JSON.parse(raw)
      datadogRum.init({ ...config, plugins: [nuxtRumPlugin(useRouter())] })
    }
  }
})
