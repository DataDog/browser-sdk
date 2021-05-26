export interface RumSetupOptions {
  clientToken?: string
  applicationId?: string
  internalMonitoringApiKey?: string
  allowedTracingOrigins?: string[]
  service?: string
  trackInteractions?: boolean
  enableExperimentalFeatures?: string[]
}

export interface LogsSetupOptions {
  clientToken?: string
  internalMonitoringApiKey?: string
  forwardErrorsToLogs?: boolean
}

export interface SetupOptions {
  rum?: RumSetupOptions
  rumRecorder?: RumSetupOptions
  logs?: LogsSetupOptions
  rumInit: (rumOptions: RumSetupOptions) => void
  head?: string
  body?: string
}

export type SetupFactory = (options: SetupOptions) => string

const isBrowserStack =
  browser.config.services &&
  browser.config.services.some((service) => (Array.isArray(service) ? service[0] : service) === 'browserstack')

export const DEFAULT_SETUPS = isBrowserStack
  ? [{ name: 'bundle', factory: bundleSetup }]
  : [
      { name: 'async', factory: asyncSetup },
      { name: 'npm', factory: npmSetup },
      { name: 'bundle', factory: bundleSetup },
    ]

export function asyncSetup(options: SetupOptions) {
  let body = options.body || ''

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
          DD_LOGS.init(${formatLogsOptions(options.logs)})
        })
      </script>
    `
  }

  const rumOptions = options.rumRecorder || options.rum
  if (rumOptions) {
    body += html`
      <script type="text/javascript">
        ${formatSnippet(options.rumRecorder ? './datadog-rum-recorder.js' : './datadog-rum.js', 'DD_RUM')}
        DD_RUM.onReady(function () {
          ;(${options.rumInit.toString()})(${formatRumOptions(rumOptions)})
        })
      </script>
    `
  }

  return basePage({
    body,
    header: options.head,
  })
}

export function bundleSetup(options: SetupOptions) {
  let header = options.head || ''

  if (options.logs) {
    header += html`
      <script type="text/javascript" src="./datadog-logs.js"></script>
      <script type="text/javascript">
        DD_LOGS.init(${formatLogsOptions(options.logs)})
      </script>
    `
  }

  const rumOptions = options.rumRecorder || options.rum
  if (rumOptions) {
    header += html`
      <script
        type="text/javascript"
        src="${options.rumRecorder ? './datadog-rum-recorder.js' : './datadog-rum.js'}"
      ></script>
      <script type="text/javascript">
        ;(${options.rumInit.toString()})(${formatRumOptions(rumOptions)})
      </script>
    `
  }

  return basePage({
    header,
    body: options.body,
  })
}

export function npmSetup(options: SetupOptions) {
  let header = options.head || ''

  if (options.logs) {
    header += html`
      <script type="text/javascript">
        window.LOGS_CONFIG = ${formatLogsOptions(options.logs)}
      </script>
    `
  }

  const rumOptions = options.rumRecorder || options.rum
  if (rumOptions) {
    header += html`
      <script type="text/javascript">
        window.RUM_INIT = () => {
          ;(${options.rumInit.toString()})(${formatRumOptions(rumOptions)})
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

function formatLogsOptions(options: LogsSetupOptions) {
  return JSON.stringify(options)
}

function formatRumOptions(options: RumSetupOptions) {
  return JSON.stringify(options).replace('"LOCATION_ORIGIN"', 'location.origin')
}
