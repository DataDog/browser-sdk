# `rum`

It contains everything related to RUM stuff. When loaded, it exposes a `window.DD_RUM` that
contains all the public APIs.

### Typical use

```
<script src = 'https://www.datadoghq-browser-agent.com/datadog-rum-us.js'>
<script>
    window.DD_RUM.init({
        applicationId: 'XXX',
        clientToken: 'XXX',
        datacenter: 'us',
        resourceSampleRate: 100,
        sampleRate: 100
    });
</script>
```

### API exposed in `window.DD_RUM`

- Init must be called to start the tracking. Configurable options:

  - `sampleRate`: percentage of sessions to track. Only tracked sessions send rum events.
  - `resourceSampleRate`: percentage of tracked sessions with resources collection.
  - `datacenter`: defined to which datacenter we'll send collected data ('us' | 'eu')

  ```
  init(configuration: {
      applicationId: string,
      clientToken: string,
      datacenter?: string,
      resourceSampleRate?: number
      sampleRate?: number
  })
  ```

- Modify the global context

  ```
  addRumGlobalContext (key: string, value: any)  # add one key-value to the default context
  setRumGlobalContext (context: Context)  # entirely replace the default context
  ```

- Add user action

  ```
  addUserAction (name: string, context: Context)
  ```

- Get internal context

  ```
  getInternalContext () # retrieve RUM internal context (link with other products)
  ```
