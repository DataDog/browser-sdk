import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import type { Servers } from './httpServers'

export interface SetupOptions {
  rum?: RumInitConfiguration
  useRumSlim: boolean
  logs?: LogsInitConfiguration
  rumInit: (initConfiguration: RumInitConfiguration) => void
  eventBridge: boolean
  head?: string
  body?: string
}

export type SetupFactory = (options: SetupOptions, servers: Servers) => string

const isBrowserStack =
  'services' in browser.config &&
  browser.config.services &&
  browser.config.services.some((service) => (Array.isArray(service) ? service[0] : service) === 'browserstack')

export const DEFAULT_SETUPS = isBrowserStack
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
          DD_LOGS.init(${formatLogsConfiguration(options.logs)})
        })
      </script>
    `
  }

  if (options.rum) {
    body += html`
      <script type="text/javascript">
        ${formatSnippet(options.useRumSlim ? './datadog-rum-slim.js' : './datadog-rum.js', 'DD_RUM')}
        DD_RUM.onReady(function () {
          ;(${options.rumInit.toString()})(${formatRumConfiguration(options.rum)})
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
        DD_LOGS.init(${formatLogsConfiguration(options.logs)})
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
        ;(${options.rumInit.toString()})(${formatRumConfiguration(options.rum)})
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
        window.LOGS_CONFIG = ${formatLogsConfiguration(options.logs)}
      </script>
    `
  }

  if (options.rum) {
    header += html`
      <script type="text/javascript">
        window.RUM_INIT = () => {
          ;(${options.rumInit.toString()})(${formatRumConfiguration(options.rum)})
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
    <!DOCTYPE html>
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

  return html`
    <script type="text/javascript">
      window.DatadogEventBridge = {
        getAllowedWebViewHosts() {
          return '["${baseHostname}"]'
        },
        send(e) {
          const { eventType, event } = JSON.parse(e)
          const request = new XMLHttpRequest()
          let endpoint
          switch (eventType) {
            case 'internal_log':
              endpoint = 'internalMonitoring'
              break
            case 'log':
              endpoint = 'logs'
              break
            default:
              endpoint = 'rum'
          }
          request.open('POST', \`${servers.intake.url}/v1/input/\${endpoint}?bridge=1\`, true)
          request.send(JSON.stringify(event))
        },
      }
    </script>
  `
}

function formatLogsConfiguration(initConfiguration: LogsInitConfiguration) {
  return formatConfiguration(initConfiguration)
}

function formatRumConfiguration(initConfiguration: RumInitConfiguration) {
  return formatConfiguration(initConfiguration).replace('"LOCATION_ORIGIN"', 'location.origin')
}

function formatConfiguration(initConfiguration: LogsInitConfiguration | RumInitConfiguration) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  let result = JSON.stringify(initConfiguration, (key, value) => (key === 'beforeSend' ? 'BEFORE_SEND' : value))
  if (initConfiguration.beforeSend) {
    result = result.replace('"BEFORE_SEND"', initConfiguration.beforeSend.toString())
  }
  return result
}
