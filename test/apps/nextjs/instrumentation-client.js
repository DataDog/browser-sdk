import { openobserveRum } from '@openobserve/browser-rum'
import { nextjsPlugin } from '@openobserve/browser-rum-nextjs'

const params = new URLSearchParams(window.location.search)
const config = params.get('rum-config')
const context = params.get('rum-context')

if (config && !openobserveRum.getInitConfiguration()) {
  openobserveRum.init({ ...JSON.parse(config), plugins: [nextjsPlugin()] })
  if (context) {
    openobserveRum.setGlobalContext(JSON.parse(context))
  }
}

export { onRouterTransitionStart } from '@openobserve/browser-rum-nextjs'
