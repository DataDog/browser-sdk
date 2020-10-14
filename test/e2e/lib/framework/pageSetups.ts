export interface RumSetupOptions {
  clientToken?: string
  applicationId?: string
  internalMonitoringApiKey?: string
  allowedTracingOrigins?: string[]
  service?: string
  trackInteractions?: boolean
}

export interface LogsSetupOptions {
  clientToken?: string
  internalMonitoringApiKey?: string
  forwardErrorsToLogs?: boolean
}

export interface SetupOptions {
  rum?: RumSetupOptions
  logs?: LogsSetupOptions
  head?: string
  body?: string
}

export type SetupFactory = (options: SetupOptions) => string

export const DEFAULT_SETUPS = [
  { name: 'async', factory: asyncSetup },
  { name: 'npm', factory: npmSetup },
  { name: 'bundle', factory: bundleSetup },
]

export function asyncSetup(options: SetupOptions) {
  let body = options.body || ''

  function formatSnippet(url: string, globalName: string) {
    return `(function(r,a,w,l,s) {
r=r[s]=r[s]||{q:[],onReady:function(c){r.q.push(c)}}
s=a.createElement(w);s.async=1;s.src=l
l=a.getElementsByTagName(w)[0];l.parentNode.insertBefore(s,l)
})(window,document,'script','${url}','${globalName}')`
  }

  if (options.logs) {
    body += html`
      <script>
        ${formatSnippet('./datadog-logs.js', 'DD_LOGS')}
        DD_LOGS.onReady(function() {
          DD_LOGS.init(${formatLogsOptions(options.logs)})
        })
      </script>
    `
  }

  if (options.rum) {
    body += html`
      <script type="text/javascript">
        ${formatSnippet('./datadog-rum.js', 'DD_RUM')}
        DD_RUM.onReady(function() {
          DD_RUM.init(${formatRumOptions(options.rum)})
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
  if (options.rum) {
    header += html`
      <script type="text/javascript" src="./datadog-rum.js"></script>
      <script type="text/javascript">
        DD_RUM.init(${formatRumOptions(options.rum)})
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
  if (options.rum) {
    header += html`
      <script type="text/javascript">
        window.RUM_CONFIG = ${formatRumOptions(options.rum)}
      </script>
    `
  }

  header += html`
    <script type="text/javascript" src="./app.js"></script>
  `

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
export function html(parts: ReadonlyArray<string>, ...vars: string[]) {
  return parts.reduce((full, part, index) => full + vars[index - 1] + part)
}

function formatLogsOptions(options: LogsSetupOptions) {
  return JSON.stringify(options)
}
function formatRumOptions(options: RumSetupOptions) {
  return JSON.stringify(options).replace('"LOCATION_ORIGIN"', 'location.origin')
}
