# `logs`

Datadog browser logs library.

[Browser support](./BROWSER_SUPPORT.md#logger)

## Setup

### NPM

```
import { datadogLogs } from '@datadog/browser-logs'
datadogLogs.init({
  clientToken: 'XXX',
  datacenter: 'us',
  forwardErrorsToLogs: true,
  sampleRate: 100
})
```

### Bundle

```
<script src = 'https://www.datadoghq-browser-agent.com/datadog-logs-us.js'>
<script>
  window.DD_LOGS.init({
    clientToken: 'XXX',
    datacenter: 'us',
    forwardErrorsToLogs: true,
    sampleRate: 100
  });
</script>
```

## Public API

What we call `Context` is a map `{key: value}` that will be added to the message context.

- Init must be called before other methods. Configurable options:

  - `isCollectingError`: when truthy, we'll automatically forward `console.error` logs, uncaught exceptions and network errors.
  - `sampleRate`: percentage of sessions to track. Only tracked sessions send logs.
  - `datacenter`: defined to which datacenter we'll send collected data ('us' | 'eu')
  - `silentMultipleInit`: prevent logging errors while having multiple Init
  - `service`: defined the service name
  - `env`: defined the environment of the service
  - `version`: defined the version of the service

  ```
  init(configuration: {
      clientToken: string,
      datacenter?: string,
      isCollectingError?: boolean,
      sampleRate?: number,
      silentMultipleInit?: boolean,
      service?: string,
      env?: string,
      version?: string,
  })
  ```

- Default logger

  ```
  logger.debug | info | warn | error (message: string, messageContext = Context)`
  logger.log (message: string, messageContext: Context, status? = 'debug' | 'info' | 'warn' | 'error')
  logger.setLevel (level?: 'debug' | 'info' | 'warn' | 'error')
  logger.setHandler (handler?: 'http' | 'console' | 'silent')
  logger.addContext (key: string, value: any)  # add one key-value to the logger context
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
  setLoggerGlobalContext (context: Context)  # entirely replace the default context
  ```

## TypeScript support

Types are compatible with TypeScript >= 3.0.
For earlier version, you can import js sources and use global variable to avoid any compilation issue:

```
import '@datadog/browser-logs/bundle/datadog-logs-us';

window.DD_LOGS.init({
  clientToken: 'XXX',
  datacenter: 'us',
  forwardErrorsToLogs: true,
  sampleRate: 100
});
```
