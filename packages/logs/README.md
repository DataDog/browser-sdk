# Browser Log Collection

Send logs to Datadog from web browsers or other Javascript clients with the browser logs SDK.

With the browser logs SDK, you can send logs directly to Datadog from JS clients and leverage the following features:

- Use the SDK as a logger. Everything is forwarded to Datadog as JSON documents.
- Add `context` and extra custom attributes to each log sent.
- Wrap and forward every frontend error automatically.
- Forward frontend errors.
- Record real client IP addresses and user agents.
- Optimized network usage with automatic bulk posts.

## Setup

**Datadog client token**: For security reasons, [API keys][1] cannot be used to configure the browser logs SDK, because they would be exposed client-side in the JavaScript code. To collect logs from web browsers, a [client token][2] must be used. See the [client token documentation][2] for more details.

**Datadog browser logs SDK**: Configure the SDK through [NPM](#npm) or use the [CDN async](#cdn-async) or [CDN sync](#cdn-sync) code snippets in the head tag.

**Supported browsers**: The browser logs SDK supports all modern desktop and mobile browsers including IE11. See the [browser support][4] table.

### Choose the right installation method

| Installation method        | Use case                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm (node package manager) | This method is recommended for modern web applications. The browser logs SDK gets packaged with the rest of your front-end javascript code. It has no impact on page load performance. However, the SDK might miss errors, resources and user actions triggered before the SDK is initialized. **Note:** it is recommended to use a matching version with RUM SDK if used. |
| CDN async                  | This method is recommended for web applications with performance targets. The browser logs SDK is loaded from our CDN asynchronously: this method ensures the SDK download does not impact page load performance. However, the SDK might miss errors, resources and user actions triggered before the SDK is initialized.                                                  |
| CDN sync                   | This method is recommended for collecting all RUM events. The browser logs SDK is loaded from our CDN synchronously: this method ensures the SDK is loaded first and collects all errors, resources and user actions. This method might impact page load performance.                                                                                                      |

### NPM

After adding [`@datadog/browser-logs`][3] to your `package.json` file, initialize it with:

```javascript
import { datadogLogs } from '@datadog/browser-logs'

datadogLogs.init({
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  forwardErrorsToLogs: true,
  sampleRate: 100,
})
```

### CDN async

Load and configure the SDK in the head section of your pages.

<!-- prettier-ignore -->
```html
<html>
  <head>
    <title>Example to send logs to Datadog</title>
      <script>
      (function(h,o,u,n,d) {
        h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
        d=o.createElement(u);d.async=1;d.src=n
        n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
      })(window,document,'script','https://www.datadoghq-browser-agent.com/datadog-logs.js','DD_LOGS')
      DD_LOGS.onReady(function() {
          DD_LOGS.init({
            clientToken: 'XXX',
            site: 'datadoghq.com',
            forwardErrorsToLogs: true,
            sampleRate: 100,
          })
        })
      </script>
  </head>
</html>
```

**Note:** Early API calls must be wrapped in the `DD_LOGS.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

### CDN sync

To receive all logs and errors, load and configure the SDK at the beginning of the head section for your pages.

```html
<html>
  <head>
    <title>Example to send logs to Datadog</title>
    <script type="text/javascript" src="https://www.datadoghq-browser-agent.com/datadog-logs.js"></script>
    <script>
      window.DD_LOGS &&
        DD_LOGS.init({
          clientToken: '<CLIENT_TOKEN>',
          site: '<DATADOG_SITE>',
          forwardErrorsToLogs: true,
          sampleRate: 100,
        })
    </script>
  </head>
</html>
```

**Note**: The `window.DD_LOGS` check is used to prevent issues if a loading failure occurs with the SDK.

### TypeScript

Types are compatible with TypeScript >= 3.0. For earlier versions, import JS sources and use global variables to avoid any compilation issues:

```typescript
import '@datadog/browser-logs/bundle/datadog-logs'

window.DD_LOGS.init({
  clientToken: '<CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  forwardErrorsToLogs: true,
  sampleRate: 100,
})
```

## Configuration

### Initialization parameters

The following parameters are available to configure the Datadog browser logs SDK to send logs to Datadog:

| Parameter             | Type    | Required | Default         | Description                                                                                              |
| --------------------- | ------- | -------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `clientToken`         | String  | Yes      |                 | A [Datadog client token][2].                                                                             |
| `site`                | String  | Yes      | `datadoghq.com` | The Datadog site of your organization. US: `datadoghq.com`, EU: `datadoghq.eu`                           |
| `service`             | String  | No       |                 | The service name for your application.                                                                   |
| `env`                 | String  | No       |                 | The application’s environment, for example: prod, pre-prod, staging, etc.                                |
| `version`             | String  | No       |                 | The application’s version, for example: 1.2.3, 6c44da20, 2020.02.13, etc.                                |
| `forwardErrorsToLogs` | Boolean | No       | `true`          | Set to `false` to stop forwarding console.error logs, uncaught exceptions and network errors to Datadog. |
| `sampleRate`          | Number  | No       | `100`           | The percentage of sessions to track: `100` for all, `0` for none. Only tracked sessions send logs.       |
| `silentMultipleInit`  | Boolean | No       |                 | Prevent logging errors while having multiple init.                                                       |

Options that must have a matching configuration when using the `RUM` SDK:

| Parameter                      | Type    | Required | Default | Description                                                                                                                                                  |
| ------------------------------ | ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trackSessionAcrossSubdomains` | Boolean | No       | `false` | Preserve the session across subdomains for the same site.                                                                                                    |
| `useSecureSessionCookie`       | Boolean | No       | `false` | Use a secure session cookie. This disables logs sent on insecure (non-HTTPS) connections.                                                                    |
| `useCrossSiteSessionCookie`    | Boolean | No       | `false` | Use a secure cross-site session cookie. This allows the logs SDK to run when the site is loaded from another one (iframe). Implies `useSecureSessionCookie`. |

## Usage

### Custom logs

After the Datadog browser logs SDK is initialized, send a custom log entry directly to Datadog with the API:

```
logger.debug | info | warn | error (message: string, messageContext = Context)
```

#### NPM

```javascript
import { datadogLogs } from '@datadog/browser-logs'

datadogLogs.logger.info('Button clicked', { name: 'buttonName', id: 123 })
```

#### CDN async

```javascript
DD_LOGS.onReady(function () {
  DD_LOGS.logger.info('Button clicked', { name: 'buttonName', id: 123 })
})
```

**Note:** Early API calls must be wrapped in the `DD_LOGS.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

#### CDN sync

```javascript
window.DD_LOGS && DD_LOGS.logger.info('Button clicked', { name: 'buttonName', id: 123 })
```

**Note**: The `window.DD_LOGS` check is used to prevent issues if a loading failure occurs with the SDK.

#### Results

The results are the same when using NPM, CDN async or CDN sync:

```json
{
  "status": "info",
  "session_id": "1234",
  "name": "buttonName",
  "id": 123,
  "message": "Button clicked",
  "http": {
    "url": "...",
    "useragent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.130 Safari/537.36"
  },
  "network": { "client": { "ip": "109.30.xx.xxx" } }
}
```

The logger adds the following information by default:

- `view.url`
- `session_id`
- `http.useragent`
- `network.client.ip`

### Status parameter

After the Datadog browser logs SDK is initialized, send a custom log entry to Datadog with the API using the status as a parameter:

```
log (message: string, messageContext: Context, status? = 'debug' | 'info' | 'warn' | 'error')
```

#### NPM

For NPM, use:

```javascript
import { datadogLogs } from '@datadog/browser-logs';

datadogLogs.logger.log(<MESSAGE>,<JSON_ATTRIBUTES>,<STATUS>);
```

#### CDN async

For CDN async, use:

```javascript
DD_LOGS.onReady(function() {
  DD_LOGS.logger.log(<MESSAGE>,<JSON_ATTRIBUTES>,<STATUS>);
})
```

**Note:** Early API calls must be wrapped in the `DD_LOGS.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

#### CDN sync

For CDN sync, use:

```javascript
window.DD_LOGS && DD_LOGS.logger.log(<MESSAGE>,<JSON_ATTRIBUTES>,<STATUS>);
```

#### Placeholders

The placeholders in the examples above are described below:

| Placeholder         | Description                                                                             |
| ------------------- | --------------------------------------------------------------------------------------- |
| `<MESSAGE>`         | The message of your log that is fully indexed by Datadog.                               |
| `<JSON_ATTRIBUTES>` | A valid JSON object, which includes all attributes attached to the `<MESSAGE>`.         |
| `<STATUS>`          | The status of your log; accepted status values are `debug`, `info`, `warn`, or `error`. |

## Advanced usage

### Scrub sensitive data from your Browser logs

If your Browser logs contain sensitive information that needs redacting, configure the Browser SDK to scrub sensitive sequences by using the `beforeSend` callback when you initialize the Browser Log Collector.

The `beforeSend` callback function gives you access to each event collected by the Browser SDK before it is sent to Datadog, and lets you update commonly redacted properties.

For example, to redact email addresses from your web application URLs:

#### NPM

```javascript
import { datadogLogs } from '@datadog/browser-logs'

datadogLogs.init({
    ...,
    beforeSend: (event) => {
        // remove email from view url
        event.view.url = event.view.url.replace(/email=[^&]*/, "email=REDACTED")
    },
    ...
});
```

#### CDN Async

```javascript
DD_LOGS.onReady(function() {
    DD_LOGS.init({
        ...,
        beforeSend: (event) => {
            // remove email from view url
            event.view.url = event.view.url.replace(/email=[^&]*/, "email=REDACTED")
        },
        ...
    })
})
```

#### CDN Sync

```javascript
window.DD_LOGS &&
    window.DD_LOGS.init({
        ...,
        beforeSend: (event) => {
            // remove email from view url
            event.view.url = event.view.url.replace(/email=[^&]*/, "email=REDACTED")
        },
        ...
    });
```

You can update the following event properties:

| Attribute       | Type   | Description                                                                                      |
| --------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `view.url`      | String | The URL of the active web page.                                                                  |
| `view.referrer` | String | The URL of the previous web page from which a link to the currently requested page was followed. |
| `message`       | String | The content of the log.                                                                          |
| `error.stack`   | String | The stack trace or complementary information about the error.                                    |
| `http.url`      | String | The HTTP URL.                                                                                    |

**Note**: The Browser SDK will ignore modifications made to event properties not listed above. For more information about event properties, see the [Browser SDK repository][5].

### Define multiple loggers

The Datadog browser logs SDK contains a default logger, but it is possible to define different loggers.

#### Create a new logger

After the Datadog browser logs SDK is initialized, use the API `createLogger` to define a new logger:

```typescript
createLogger (name: string, conf?: {
    level?: 'debug' | 'info' | 'warn' | 'error',
    handler?: 'http' | 'console' | 'silent',
    context?: Context
})
```

**Note**: These parameters can be set with the [setLevel](#filter-by-status), [setHandler](#change-the-destination), and [setContext](#overwrite-context) APIs.

#### Get a custom logger

After the creation of a logger, access it in any part of your JavaScript code with the API:

```typescript
getLogger(name: string)
```

##### NPM

For example, assume there is a `signupLogger`, defined with all the other loggers:

```javascript
import { datadogLogs } from '@datadog/browser-logs'

datadogLogs.createLogger('signupLogger', 'info', 'http', { env: 'staging' })
```

It can now be used in a different part of the code with:

```javascript
import { datadogLogs } from '@datadog/browser-logs'

const signupLogger = datadogLogs.getLogger('signupLogger')
signupLogger.info('Test sign up completed')
```

#### CDN async

For example, assume there is a `signupLogger`, defined with all the other loggers:

```javascript
DD_LOGS.onReady(function () {
  const signupLogger = DD_LOGS.createLogger('signupLogger', 'info', 'http', { env: 'staging' })
})
```

It can now be used in a different part of the code with:

```javascript
DD_LOGS.onReady(function () {
  const signupLogger = DD_LOGS.getLogger('signupLogger')
  signupLogger.info('Test sign up completed')
})
```

**Note:** Early API calls must be wrapped in the `DD_LOGS.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

##### CDN sync

For example, assume there is a `signupLogger`, defined with all the other loggers:

```javascript
if (window.DD_LOGS) {
  const signupLogger = DD_LOGS.createLogger('signupLogger', 'info', 'http', { env: 'staging' })
}
```

It can now be used in a different part of the code with:

```javascript
if (window.DD_LOGS) {
  const signupLogger = DD_LOGS.getLogger('signupLogger')
  signupLogger.info('Test sign up completed')
}
```

**Note**: The `window.DD_LOGS` check is used to prevent issues if a loading failure occurs with the SDK.

### Overwrite context

#### Global context

After the Datadog browser logs SDK is initialized, it is possible to:

- Set the entire context for all your loggers with the `setLoggerGlobalContext (context: Context)` API.
- Add a context to all your loggers with `addLoggerGlobalContext (key: string, value: any)` API.
- Get the entire global context with `getLoggerGlobalContext ()` API.

##### NPM

For NPM, use:

```javascript
import { datadogLogs } from '@datadog/browser-logs'

datadogLogs.setLoggerGlobalContext({ env: 'staging' })

datadogLogs.addLoggerGlobalContext('referrer', document.referrer)

const context = datadogLogs.getLoggerGlobalContext() // => {env: 'staging', referrer: ...}
```

#### CDN async

For CDN async, use:

```javascript
DD_LOGS.onReady(function () {
  DD_LOGS.setLoggerGlobalContext({ env: 'staging' })
})

DD_LOGS.onReady(function () {
  DD_LOGS.addLoggerGlobalContext('referrer', document.referrer)
})

DD_LOGS.onReady(function () {
  var context = DD_LOGS.getLoggerGlobalContext() // => {env: 'staging', referrer: ...}
})
```

**Note:** Early API calls must be wrapped in the `DD_LOGS.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

##### CDN sync

For CDN sync, use:

```javascript
window.DD_LOGS && DD_LOGS.setLoggerGlobalContext({ env: 'staging' })

window.DD_LOGS && DD_LOGS.addLoggerGlobalContext('referrer', document.referrer)

var context = window.DD_LOGS && DD_LOGS.getLoggerGlobalContext() // => {env: 'staging', referrer: ...}
```

**Note**: The `window.DD_LOGS` check is used to prevent issues if a loading failure occurs with the SDK.

#### Logger context

After a logger is created, it is possible to:

- Set the entire context for your logger with the `setContext (context: Context)` API.
- Add a context to your logger with `addContext (key: string, value: any)` API:

##### NPM

For NPM, use:

```javascript
import { datadogLogs } from '@datadog/browser-logs'

datadogLogs.setContext("{'env': 'staging'}")

datadogLogs.addContext('referrer', document.referrer)
```

#### CDN async

For CDN async, use:

```javascript
DD_LOGS.onReady(function () {
  DD_LOGS.setContext("{'env': 'staging'}")
})

DD_LOGS.onReady(function () {
  DD_LOGS.addContext('referrer', document.referrer)
})
```

**Note:** Early API calls must be wrapped in the `DD_LOGS.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

##### CDN sync

For CDN sync, use:

```javascript
window.DD_LOGS && DD_LOGS.setContext("{'env': 'staging'}")

window.DD_LOGS && DD_LOGS.addContext('referrer', document.referrer)
```

**Note**: The `window.DD_LOGS` check is used to prevent issues if a loading failure occurs with the SDK.

### Filter by status

After the Datadog browser logs SDK is initialized, the minimal log level for your logger is set with the API:

```
setLevel (level?: 'debug' | 'info' | 'warn' | 'error')
```

Only logs with a status equal to or higher than the specified level are sent.

##### NPM

For NPM, use:

```javascript
import { datadogLogs } from '@datadog/browser-logs'

datadogLogs.logger.setLevel('<LEVEL>')
```

#### CDN async

For CDN async, use:

```javascript
DD_LOGS.onReady(function () {
  DD_LOGS.logger.setLevel('<LEVEL>')
})
```

**Note:** Early API calls must be wrapped in the `DD_LOGS.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

##### CDN sync

For CDN sync, use:

```javascript
window.DD_LOGS && DD_LOGS.logger.setLevel('<LEVEL>')
```

**Note**: The `window.DD_LOGS` check is used to prevent issues if a loading failure occurs with the SDK.

### Change the destination

By default, loggers created by the Datadog browser logs SDK are sending logs to Datadog. After the Datadog browser logs SDK is initialized, it is possible to configure the logger to:

- send logs to the `console` and Datadog (`http`)
- send logs to the `console` only
- not send logs at all (`silent`)

```
setHandler (handler?: 'http' | 'console' | 'silent' | Array<handler>)
```

##### NPM

For NPM, use:

```javascript
import { datadogLogs } from '@datadog/browser-logs'

datadogLogs.logger.setHandler('<HANDLER>')
datadogLogs.logger.setHandler(['<HANDLER1>', '<HANDLER2>'])
```

#### CDN async

For CDN async, use:

```javascript
DD_LOGS.onReady(function () {
  DD_LOGS.logger.setHandler('<HANDLER>')
  DD_LOGS.logger.setHandler(['<HANDLER1>', '<HANDLER2>'])
})
```

**Note:** Early API calls must be wrapped in the `DD_LOGS.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

##### CDN sync

For CDN sync, use:

```javascript
window.DD_LOGS && DD_LOGS.logger.setHandler('<HANDLER>')
window.DD_LOGS && DD_LOGS.logger.setHandler(['<HANDLER1>', '<HANDLER2>'])
```

**Note**: The `window.DD_LOGS` check is used to prevent issues if a loading failure occurs with the SDK.

[1]: /account_management/api-app-keys/#api-keys
[2]: /account_management/api-app-keys/#client-tokens
[3]: https://www.npmjs.com/package/@datadog/browser-logs
[4]: https://github.com/DataDog/browser-sdk/blob/main/packages/logs/BROWSER_SUPPORT.md
[5]: https://github.com/DataDog/browser-sdk/blob/main/packages/logs/src/logsEvent.types.ts
