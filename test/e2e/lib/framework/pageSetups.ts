import { generateUUID, INTAKE_URL_PARAMETERS } from '@datadog/browser-core'
import type { LogsInitConfiguration } from '@datadog/browser-logs'
import type { RumInitConfiguration, RemoteConfiguration } from '@datadog/browser-rum-core'
import type test from '@playwright/test'
import { isBrowserStack, isContinuousIntegration } from './environment'
import type { Servers } from './httpServers'

export interface SetupOptions {
  rum?: RumInitConfiguration
  useRumSlim: boolean
  logs?: LogsInitConfiguration
  logsInit: (initConfiguration: LogsInitConfiguration) => void
  rumInit: (initConfiguration: RumInitConfiguration) => void
  remoteConfiguration?: RemoteConfiguration
  eventBridge: boolean
  head?: string
  body?: string
  basePath: string
  context: {
    run_id: string
    test_name: string
  }
  testFixture: typeof test
  extension?: {
    rumConfiguration?: RumInitConfiguration
    logsConfiguration?: LogsInitConfiguration
  }
  hostName?: string
  worker?: WorkerOptions
}

export interface WorkerOptions {
  importScripts?: boolean
  nativeLog?: boolean
  rumConfiguration?: RumInitConfiguration
  logsConfiguration?: LogsInitConfiguration
}

export type SetupFactory = (options: SetupOptions, servers: Servers) => string

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

  if (options.extension) {
    header += setupExtension(options, servers)
  }

  function formatSnippet(url: string, globalName: string) {
    return `(function(h,o,u,n,d) {
h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
d=o.createElement(u);d.async=1;d.src=n
n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
})(window,document,'script','${url}','${globalName}')`
  }

  const { logsScriptUrl, rumScriptUrl } = createCrossOriginScriptUrls(servers, options)

  if (options.logs) {
    body += html`
      <script>
        ${formatSnippet(logsScriptUrl, 'DD_LOGS')}
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
        ${formatSnippet(rumScriptUrl, 'DD_RUM')}
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

  if (options.extension) {
    header += setupExtension(options, servers)
  }

  const { logsScriptUrl, rumScriptUrl } = createCrossOriginScriptUrls(servers, options)

  if (options.logs) {
    header += html`
      <script type="text/javascript" src="${logsScriptUrl}"></script>
      <script type="text/javascript">
        DD_LOGS.setGlobalContext(${JSON.stringify(options.context)})
        ;(${options.logsInit.toString()})(${formatConfiguration(options.logs, servers)})
      </script>
    `
  }

  if (options.rum) {
    header += html`
      <script type="text/javascript" src="${rumScriptUrl}"></script>
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
  const body = options.body || ''

  if (options.eventBridge) {
    header += setupEventBridge(servers)
  }

  if (options.extension) {
    header += setupExtension(options, servers)
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
    body,
  })
}

export function reactSetup(options: SetupOptions, servers: Servers, appName: string) {
  let header = options.head || ''
  let body = options.body || ''

  if (options.eventBridge) {
    header += setupEventBridge(servers)
  }

  if (options.extension) {
    header += setupExtension(options, servers)
  }

  if (options.rum) {
    header += html`
      <script type="text/javascript">
        window.RUM_CONFIGURATION = ${formatConfiguration(options.rum, servers)}
        window.RUM_CONTEXT = ${JSON.stringify(options.context)}
      </script>
    `
  }

  body += html` <script type="text/javascript" src="./${appName}.js"></script> `

  return basePage({
    header,
    body,
  })
}

export function workerSetup(options: WorkerOptions, servers: Servers) {
  let setup = ''

  if (options.logsConfiguration) {
    setup += js`
      ${options.importScripts ? js`importScripts('/datadog-logs.js');` : js`import '/datadog-logs.js';`}
      DD_LOGS._setDebug(true)
      DD_LOGS.init(${formatConfiguration(options.logsConfiguration, servers)})
      `
  }

  if (options.rumConfiguration) {
    setup += js`
      ${options.importScripts ? js`importScripts('/datadog-rum.js');` : js`import '/datadog-rum.js';`}
      DD_RUM._setDebug(true)
      DD_RUM.init(${formatConfiguration(options.rumConfiguration, servers)})
    `
  }

  setup += js`
    self.addEventListener('message', (event) => {
      const message = event.data;
      ${!options.nativeLog && options.logsConfiguration ? js`DD_LOGS.logger.log(message);` : js`console.log(message);`}
    });
  `

  return setup
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

function js(parts: readonly string[], ...vars: string[]) {
  return parts.reduce((full, part, index) => full + vars[index - 1] + part)
}

function setupEventBridge(servers: Servers) {
  const baseHostname = new URL(servers.base.origin).hostname

  // Send EventBridge events to the intake so we can inspect them in our E2E test cases. The URL
  // needs to be similar to the normal Datadog intake (through proxy) to make the SDK completely
  // ignore them.
  const eventBridgeIntake = `${servers.intake.origin}/?${new URLSearchParams({
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

function setupExtension(options: SetupOptions, servers: Servers) {
  let header = ''

  const { rumScriptUrl, logsScriptUrl } = createCrossOriginScriptUrls(servers, { ...options, useRumSlim: false })

  if (options.extension?.rumConfiguration) {
    header += html`
      <script type="text/javascript">
        window.RUM_BUNDLE_URL = '${rumScriptUrl}'
        window.RUM_CONTEXT = ${JSON.stringify(options.context)}
        window.EXT_RUM_CONFIGURATION = ${formatConfiguration(options.extension.rumConfiguration, servers)}
      </script>
    `
  }

  if (options.extension?.logsConfiguration) {
    header += html`
      <script type="text/javascript">
        window.LOGS_BUNDLE_URL = '${logsScriptUrl}'
        window.LOGS_CONTEXT = ${JSON.stringify(options.context)}
        window.EXT_LOGS_CONFIGURATION = ${formatConfiguration(options.extension.logsConfiguration, servers)}
      </script>
    `
  }

  return header
}

export function formatConfiguration(initConfiguration: LogsInitConfiguration | RumInitConfiguration, servers: Servers) {
  const fns = new Map<string, () => void>()

  let result = JSON.stringify(
    {
      ...initConfiguration,
      proxy: servers.intake.origin,
      remoteConfigurationProxy: `${servers.base.origin}/config`,
    },
    (_key, value) => {
      if (typeof value === 'function') {
        const id = generateUUID()
        fns.set(id, value)

        return id
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return value
    }
  )

  result = result.replace('"LOCATION_ORIGIN"', 'location.origin')

  for (const [id, fn] of fns) {
    result = result.replace(`"${id}"`, fn.toString())
  }

  return result
}

export function createCrossOriginScriptUrls(servers: Servers, options: SetupOptions) {
  return {
    logsScriptUrl: `${servers.crossOrigin.origin}/datadog-logs.js`,
    rumScriptUrl: `${servers.crossOrigin.origin}/${options.useRumSlim ? 'datadog-rum-slim.js' : 'datadog-rum.js'}`,
  }
}
