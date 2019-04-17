# Datadog Browser Agent

The browser agent is used to collect logs and RUM data from the browser.
It's bundled into four files which are distributed through Cloudfront:

- `https://www.datadoghq-browser-agent.com/datadog-logs-(eu|us).js`
- `https://www.datadoghq-browser-agent.com/datadog-rum-(eu|us).js`

## The `logs` bundle

It contains everything needed to send logs. When loaded, it exposes a `window.Datadog` that
contains all the public APIs.

### Typical use

```
<script src = 'https://www.datadoghq-browser-agent.com/datadog-logs-us.js'>
<script>
    window.Datadog.init({
        publicApiKey: 'XXX',
        isCollectingError: true,
    });
</script>
```

### API exposed in `window.Datadog`

What we call `Context` is a map `{key: value}` that will be added to the message context.

- Init must be called before other methods. Configurable options:

  - `isCollectingError`: when truthy, we'll automatically forward `console.error` logs, uncaught exceptions and network errors.
  - `logLevel`: minimal log level to report (default: 'debug')
  - `logSendStrategy`: define how to send logs (default: 'api')

  ```
  init(configuration: {
      publicApiKey: string,
      isCollectingError?: boolean,
      logLevel?: 'debug' | 'info' | 'warn' | 'error',
      logSendStrategy?: 'api' | 'console' | 'silent'
  })
  ```

- Manually log messages

  ```
  debug | info | warn | error (message: string, context = Context)`
  log (message: string, context: Context, severity? = 'debug' | 'info' | 'warn' | 'error')
  ```

- Modify the default context for each message
  ```
  addGlobalContext (key: string, value: any)  # add one key-value to the default context
  setGlobalContext (context: Context)  # entirely replace the default context
  ```

## The `rum` bundle

It's the logs bundle + the RUM related stuff, so you'll end up with the same
`window.Datadog` but with an additional `rumProjectId` in the `init` method.

### Typical use

```
<script src = 'https://www.datadoghq-browser-agent.com/datadog-rum-us.js'>
<script>
    window.Datadog.init({
        publicApiKey: 'XXX',
        rumProjectId: 'XXX',
    });
</script>
```

### API exposed in `window.Datadog`

Right now, we don't expose any features to customize the RUM collection.
This may change at some point.
