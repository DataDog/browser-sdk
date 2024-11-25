import { INTAKE_URL_PARAMETERS } from '@datadog/browser-core'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type { Servers } from './httpServers'

export interface SetupOptions {
  rum?: RumInitConfiguration
  useRumSlim: boolean
  logs?: LogsInitConfiguration
  logsInit: (initConfiguration: LogsInitConfiguration) => void
  rumInit: (initConfiguration: RumInitConfiguration) => void
  eventBridge: boolean
  head?: string
  body?: string
  basePath: string
  context: {
    run_id: string
    test_name: string
  }
}

export type SetupFactory = (options: SetupOptions, servers: Servers) => string

const isBrowserStack = false
// 'services' in browser.options &&
// browser.options.services &&
// browser.options.services.some((service) => (Array.isArray(service) ? service[0] : service) === 'browserstack')

const isContinuousIntegration = Boolean(process.env.CI_JOB_ID)

// By default, run tests only with the 'bundle' setup outside of the CI (to run faster on the
// developer laptop) or with Browser Stack (to limit flakiness).
export const DEFAULT_SETUPS =
  !isContinuousIntegration || isBrowserStack
    ? [{ name: 'bundle', factory: bundleSetup }]
    : [
        { name: 'async', factory: asyncSetup },
        { name: 'npm', factory: npmSetup },
        { name: 'bundle', factory: bundleSetup },
      ]

export function asyncSetup(options: SetupOptions, servers: Servers) {
  let body = options.body || ''
  let header = options.head || ''

  if (options.eventBridge) {
    header += setupEventBridge(servers)
  }

  function formatSnippet(url: string, globalName: string) {
    return `(function(h,o,u,n,d) {
h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
d=o.createElement(u);d.async=1;d.src=n
n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
})(window,document,'script','${url}','${globalName}')`
  }

  if (options.logs) {
    body += html`
      <script>
        ${formatSnippet('./datadog-logs.js', 'DD_LOGS')}
        DD_LOGS.onReady(function () {
          DD_LOGS.setGlobalContext(${JSON.stringify(options.context)})
          ;(${options.logsInit.toString()})(${formatConfiguration(options.logs, servers)})
        })
      </script>
    `
  }

  if (options.rum) {
    body += html`
      <script type="text/javascript">
        ${formatSnippet(options.useRumSlim ? './datadog-rum-slim.js' : './datadog-rum.js', 'DD_RUM')}
        DD_RUM.onReady(function () {
          DD_RUM.setGlobalContext(${JSON.stringify(options.context)})
          ;(${options.rumInit.toString()})(${formatConfiguration(options.rum, servers)})
        })
      </script>
    `
  }

  return basePage({
    body,
    header,
  })
}

export function bundleSetup(options: SetupOptions, servers: Servers) {
  let header = options.head || ''

  if (options.eventBridge) {
    header += setupEventBridge(servers)
  }

  if (options.logs) {
    header += html`
      <script type="text/javascript" src="./datadog-logs.js"></script>
      <script type="text/javascript">
        DD_LOGS.setGlobalContext(${JSON.stringify(options.context)})
        ;(${options.logsInit.toString()})(${formatConfiguration(options.logs, servers)})
      </script>
    `
  }

  if (options.rum) {
    header += html`
      <script
        type="text/javascript"
        src="${options.useRumSlim ? './datadog-rum-slim.js' : './datadog-rum.js'}"
      ></script>
      <script type="text/javascript">
        DD_RUM.setGlobalContext(${JSON.stringify(options.context)})
        ;(${options.rumInit.toString()})(${formatConfiguration(options.rum, servers)})
      </script>
    `
  }

  return basePage({
    header,
    body: options.body,
  })
}

export function npmSetup(options: SetupOptions, servers: Servers) {
  let header = options.head || ''

  if (options.eventBridge) {
    header += setupEventBridge(servers)
  }

  if (options.logs) {
    header += html`
      <script type="text/javascript">
        window.LOGS_INIT = () => {
          window.DD_LOGS.setGlobalContext(${JSON.stringify(options.context)})
          ;(${options.logsInit.toString()})(${formatConfiguration(options.logs, servers)})
        }
      </script>
    `
  }

  if (options.rum) {
    header += html`
      <script type="text/javascript">
        window.RUM_INIT = () => {
          window.DD_RUM.setGlobalContext(${JSON.stringify(options.context)})
          ;(${options.rumInit.toString()})(${formatConfiguration(options.rum, servers)})
        }
      </script>
    `
  }

  header += html` <script type="text/javascript" src="./app.js"></script> `

  return basePage({
    header,
    body: options.body,
  })
}

export function basePage({ header, body }: { header?: string; body?: string }) {
  return html`
    <!doctype html>
    <html>
      <head>
        ${header || ''}
      </head>
      <body>
        ${body || ''}
      </body>
    </html>
  `
}

// html is a simple template string tag to allow prettier to format various setups as HTML
export function html(parts: readonly string[], ...vars: string[]) {
  return parts.reduce((full, part, index) => full + vars[index - 1] + part)
}

function setupEventBridge(servers: Servers) {
  const baseHostname = new URL(servers.base.url).hostname

  // Send EventBridge events to the intake so we can inspect them in our E2E test cases. The URL
  // needs to be similar to the normal Datadog intake (through proxy) to make the SDK completely
  // ignore them.
  const eventBridgeIntake = `${servers.intake.url}/?${new URLSearchParams({
    ddforward: `/api/v2/rum?${INTAKE_URL_PARAMETERS.join('&')}`,
    bridge: 'true',
  }).toString()}`

  return html`
    <script type="text/javascript">
      window.DatadogEventBridge = {
        getCapabilities() {
          return '["records"]'
        },
        getPrivacyLevel() {
          return 'mask'
        },
        getAllowedWebViewHosts() {
          return '["${baseHostname}"]'
        },
        send(e) {
          const { eventType, event } = JSON.parse(e)
          const request = new XMLHttpRequest()
          request.open('POST', ${JSON.stringify(eventBridgeIntake)} + '&event_type=' + eventType, true)
          request.send(JSON.stringify(event))
        },
      }
    </script>
  `
}

function formatConfiguration(initConfiguration: LogsInitConfiguration | RumInitConfiguration, servers: Servers) {
  let result = JSON.stringify(
    {
      ...initConfiguration,
      proxy: servers.intake.url,
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    (key, value) => (key === 'beforeSend' ? 'BEFORE_SEND' : value)
  )
  result = result.replace('"LOCATION_ORIGIN"', 'location.origin')
  if (initConfiguration.beforeSend) {
    result = result.replace('"BEFORE_SEND"', initConfiguration.beforeSend.toString())
  }
  return result
}
