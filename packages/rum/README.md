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
  - `silentMultipleInit`: prevent logging errors while having multiple Init
  - `service`: name of the corresponding service
  - `env`: environment of the service
  - `version`: version of the service

  ```
  init(configuration: {
      applicationId: string,
      clientToken: string,
      datacenter?: string,
      resourceSampleRate?: number
      sampleRate?: number,
      silentMultipleInit?: boolean,
      service?: string,
      env?: string,
      version?: string,
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

## TypeScript support

Types are compatible with TypeScript >= 3.0.
For earlier version, you can import js sources and use global variable to avoid any compilation issue:

```
import '@datadog/browser-rum/bundle/datadog-rum-us';

window.DD_RUM.init({
  applicationId: 'XXX',
  clientToken: 'XXX',
  datacenter: 'us',
  resourceSampleRate: 100,
  sampleRate: 100
});
```
