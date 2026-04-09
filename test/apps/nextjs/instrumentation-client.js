import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-nextjs'

const params = new URLSearchParams(window.location.search)
const config = params.get('rum-config')
const context = params.get('rum-context')

if (!datadogRum.getInitConfiguration()) {
  if (config) {
    // E2E test mode: config injected via query parameter
    datadogRum.init({ ...JSON.parse(config), plugins: [nextjsPlugin()] })
    if (context) {
      datadogRum.setGlobalContext(JSON.parse(context))
    }
  } else {
    // Manual testing mode: use dev server proxy
    datadogRum.init({
      applicationId: 'b3543353-4f56-4f57-aa43-c0124dfd94b9',
      clientToken: 'pub20172ebfb1199be623cdc09998aa5a18',
      site: 'datadoghq.com',
      service: 'nextjs-test',
      env: 'staging',
      version: '1.0.0',
      // proxy: '/proxy',
      sessionSampleRate: 100,
      sessionReplaySampleRate: 100,
      trackUserInteractions: true,
      allowedTracingUrls: [{ match: 'http://localhost:3000', propagatorTypes: ['datadog', 'tracecontext'] }],
      plugins: [nextjsPlugin()],
    })
  }
}

export { onRouterTransitionStart } from '@datadog/browser-rum-nextjs'
