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
      applicationId: 'e6f7bf7e-75cc-4b53-99b4-3b2fbef0764a',
      clientToken: 'pubb389563cdd39e3f55df877a2172e9cef',
      site: 'datad0g.com',
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
