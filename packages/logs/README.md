# `logs`

It contains everything needed to send logs. When loaded, it exposes a `window.DD_LOGS` that
contains all the public APIs.

[Browser support](./BROWSER_SUPPORT.md#logger)

### Typical use

```
<script src = 'https://www.datadoghq-browser-agent.com/datadog-logs-us.js'>
<script>
    window.DD_LOGS.init({
        clientToken: 'XXX',
        forwardErrorsToLogs: true,
        sampleRate: 100
    });
</script>
```

### API exposed in `window.DD_LOGS`

What we call `Context` is a map `{key: value}` that will be added to the message context.

- Init must be called before other methods. Configurable options:

  - `isCollectingError`: when truthy, we'll automatically forward `console.error` logs, uncaught exceptions and network errors.
  - `sampleRate`: percentage of sessions to track. Only tracked sessions send logs.

  ```
  init(configuration: {
      clientToken: string,
      isCollectingError?: boolean,
      sampleRate?: number
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
