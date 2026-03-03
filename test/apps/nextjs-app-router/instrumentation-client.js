import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-next-plugin'

const params = new URLSearchParams(window.location.search)
const config = params.get('rum-config')
const context = params.get('rum-context')

if (config && !datadogRum.getInitConfiguration()) {
  datadogRum.init({ ...JSON.parse(config), plugins: [nextjsPlugin()] })
  if (context) {
    datadogRum.setGlobalContext(JSON.parse(context))
  }
}
