# `rum`

Datadog browser rum library.

## Setup

### NPM

```
import { datadogRum } from '@datadog/browser-rum'
datadogRum.init({
  applicationId: 'XXX',
  clientToken: 'XXX',
  datacenter: 'us',
  resourceSampleRate: 100,
  sampleRate: 100
})
```

### Bundle

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

## Public API

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
