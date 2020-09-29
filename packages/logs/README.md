# `logs`

Datadog browser logs library.

[Browser support](./BROWSER_SUPPORT.md#logger)

## Setup

### NPM

```
import { datadogLogs } from '@datadog/browser-logs'
datadogLogs.init({
  clientToken: 'XXX',
  site: 'datadoghq.com',
  forwardErrorsToLogs: true,
  sampleRate: 100
})
```

### Bundle

```
<script src = 'https://www.datadoghq-browser-agent.com/datadog-logs.js'>
<script>
  window.DD_LOGS.init({
    clientToken: 'XXX',
    site: 'datadoghq.com',
    forwardErrorsToLogs: true,
    sampleRate: 100
  });
</script>
```

## Public API

What we call `Context` is a map `{key: value}` that will be added to the message context.

- Init must be called before other methods.

  - Configurable options:

    - `forwardErrorsToLogs`: when truthy, we'll automatically forward `console.error` logs, uncaught exceptions and network errors.
    - `sampleRate`: percentage of sessions to track. Only tracked sessions send logs.
    - `site`: The site of the Datadog intake to send SDK data to (default: 'datadoghq.com', set to 'datadoghq.eu' to send data to the EU site)
    - `silentMultipleInit`: prevent logging errors while having multiple Init
    - `service`: name of the corresponding service
    - `env`: environment of the service
    - `version`: version of the service

  - Options that must have matching configuration when using `rum` SDK:

    - `trackSessionAcrossSubdomains`: preserve session across subdomains of the same site (default: `false`)
    - `useSecureSessionCookie`: use a secure session cookie. This will disable session tracking on insecure (non-HTTPS) connections. (default: `false`)
    - `useCrossSiteSessionCookie`: use a secure cross-site session cookie. This will allow the Logs SDK to run when the site is loaded from another one (ex: via an iframe). Implies `useSecureSessionCookie`. (default: `false`)

  ```
  init(configuration: {
      clientToken: string,
      site?: string,
      forwardErrorsToLogs?: boolean,
      sampleRate?: number,
      silentMultipleInit?: boolean,
      service?: string,
      env?: string,
      version?: string,
      trackSessionAcrossSubdomains?: boolean,
      useSecureSessionCookie?: boolean,
      useCrossSiteSessionCookie?: boolean,
  })
  ```

- Default logger

  ```
  logger.debug | info | warn | error (message: string, messageContext = Context)`
  logger.log (message: string, messageContext: Context, status? = 'debug' | 'info' | 'warn' | 'error')
  logger.setLevel (level?: 'debug' | 'info' | 'warn' | 'error')
  logger.setHandler (handler?: 'http' | 'console' | 'silent')
  logger.addContext (key: string, value: any)  # add one key-value to the logger context
  logger.removeContext (key: string)  # remove one key from the logger context
  logger.setContext (context: Context)  # entirely replace the logger context
  ```

- Custom loggers

  Custom loggers have the same API than the default logger

  ```
  createLogger (name: string, conf?: {
      level?: 'debug' | 'info' | 'warn' | 'error'
      handler?: 'http' | 'console' | 'silent'
      context?: Context
  })  # create a new logger
  getLogger (name: string)  # retrieve a previously created logger
  ```

- Modify the global context for all loggers
  ```
  addLoggerGlobalContext (key: string, value: any)  # add one key-value to the default context
  removeLoggerGlobalContext (key: string)  # remove one key of the default context
  setLoggerGlobalContext (context: Context)  # entirely replace the default context
  ```

## TypeScript support

Types are compatible with TypeScript >= 3.0.
For earlier version, you can import js sources and use global variable to avoid any compilation issue:

```
import '@datadog/browser-logs/bundle/datadog-logs';

window.DD_LOGS.init({
  clientToken: 'XXX',
  site: 'datadoghq.com',
  forwardErrorsToLogs: true,
  sampleRate: 100
});
```
