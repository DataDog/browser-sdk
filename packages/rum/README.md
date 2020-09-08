# `rum`

Datadog browser rum library.

## Setup

### NPM

```
import { datadogRum } from '@datadog/browser-rum'
datadogRum.init({
  applicationId: 'XXX',
  clientToken: 'XXX',
  site: 'datadoghq.com',
  resourceSampleRate: 100,
  sampleRate: 100
})
```

### Bundle

```
<script src = 'https://www.datadoghq-browser-agent.com/datadog-rum.js'>
<script>
  window.DD_RUM.init({
    applicationId: 'XXX',
    clientToken: 'XXX',
    site: 'datadoghq.com',
    resourceSampleRate: 100,
    sampleRate: 100
  });
</script>
```

## Public API

- Init must be called to start the tracking. Configurable options:

  - `sampleRate`: percentage of sessions to track. Only tracked sessions send rum events.
  - `resourceSampleRate`: percentage of tracked sessions with resources collection.
  - `site`: The site of the Datadog intake to send SDK data to (default: 'datadoghq.com', set to 'datadoghq.eu' to send data to the EU site)
  - `silentMultipleInit`: prevent logging errors while having multiple Init
  - `trackInteractions`: collect actions initiated by user interactions
  - `service`: name of the corresponding service
  - `env`: environment of the service
  - `version`: version of the service
  - `allowedTracingOrigins`: list of string or regexp of request origins in which to inject tracing headers
  - `trackSessionAcrossSubdomains`: preserve session across subdomains of the same site
  - `enforceSecureContextExecution`: use a secure session cookie
  - `allowThirdPartyContextExecution`: use a secure cross-site session cookie

  ```
  init(configuration: {
      applicationId: string,
      clientToken: string,
      site?: string,
      resourceSampleRate?: number
      sampleRate?: number,
      silentMultipleInit?: boolean,
      trackInteractions?: boolean,
      service?: string,
      env?: string,
      version?: string,
      allowedTracingOrigins?: Array<String|Regexp>,
      trackSessionAcrossSubdomains?: boolean,
      enforceSecureContextExecution?: boolean,
      allowThirdPartyContextExecution?: boolean,
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
import '@datadog/browser-rum/bundle/datadog-rum';

window.DD_RUM.init({
  applicationId: 'XXX',
  clientToken: 'XXX',
  site: 'datadoghq.com',
  resourceSampleRate: 100,
  sampleRate: 100
});
```
