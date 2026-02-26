import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-nextjs'

datadogRum.init({
  applicationId: 'app-id',
  clientToken: 'client-token',
  site: 'datadoghq.com',
  plugins: [nextjsPlugin({ router: 'app' })],
})
