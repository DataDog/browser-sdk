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
  - `trackInteractions`: collect actions initiated by user interactions
  - `service`: name of the corresponding service
  - `env`: environment of the service
  - `version`: version of the service
  - `isCollectingError`: if RUM should collect errors. Default is `true`
  - `collectErrorMessage`: when collecting errors, if RUM should collect error message. Default is `true`. Depends on `isCollectingError`.
  - `collectErrorStack`: when collecting errors, if RUM should collect error stack trace. Default is `true`. Depends on `isCollectingError`.

  ```
  init(configuration: {
      applicationId: string,
      clientToken: string,
      datacenter?: string,
      resourceSampleRate?: number
      sampleRate?: number,
      silentMultipleInit?: boolean,
      trackInteractions?: boolean,
      service?: string,
      env?: string,
      version?: string,
      isCollectingError?: boolean,
      collectErrorMessage?: boolean,
      collectErrorStack?: boolean
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

## Declarative API

### Click action naming

The RUM library is using various strategies to get a name for click actions, but if you want more
control, you can define a `data-dd-action-name` attribute on clickable elements (or any of their
parents) that will be used to name the action. Examples:

```html
<a class="btn btn-default" href="#" role="button" data-dd-action-name="Login button">Try it out!</a>
```

```html
<div class="alert alert-danger" role="alert" data-dd-action-name="Dismiss alert">
  <span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span>
  <span class="sr-only">Error:</span>
  Enter a valid email address
</div>
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
