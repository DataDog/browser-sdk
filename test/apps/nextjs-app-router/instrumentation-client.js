import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-nextjs'

const params = new URLSearchParams(window.location.search)
const rumConfigParam = params.get('rum-config')
const contextParam = params.get('rum-context')

if (rumConfigParam) {
  window.__DD_TEST_RUM_CONFIG__ = rumConfigParam
  window.__DD_TEST_CONTEXT__ = contextParam
}

const config = window.__DD_TEST_RUM_CONFIG__
const context = window.__DD_TEST_CONTEXT__

if (config && !datadogRum.getInitConfiguration()) {
  datadogRum.init({ ...JSON.parse(config), plugins: [nextjsPlugin({ router: 'app' })] })
  if (context) {
    datadogRum.setGlobalContext(JSON.parse(context))
  }
}

// datadogRum.init({ 
//   applicationId: 'a81f40b8-e9bd-4805-9b66-4e4edc529a14',
//     clientToken: 'pubfe2e138a54296da76dd66f6b0b5f3d98',
//     site: 'datad0g.com',
//     service: 'beltrans-app-router-test',
//   plugins: [nextjsPlugin({ router: 'app' })] })
