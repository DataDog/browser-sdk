# RUM Browser Monitoring

## Overview

Datadog Real User Monitoring (RUM) enables you to visualize and analyze the real-time performance and user journeys of your application's individual users.

## Setup

### Datadog

To set up Datadog RUM browser monitoring:

1. In Datadog, navigate to the [Real User Monitoring page][1] and click the **New Application** button.
2. Enter a name for your application and click **Generate Client Token**. This generates a `clientToken` and an `applicationId` for your application.
3. Setup the Datadog RUM SDK [NPM](#npm-setup) or the [generated code snippet](#bundle-setup).
4. Deploy the changes to your application. Once your deployment is live, Datadog collects events from user browsers.
5. Visualize the [data collected][2] using Datadog [dashboards][3].

**Note**: Your application shows up on the application list page as "pending" until Datadog starts receiving data.

### NPM

Add [`@datadog/browser-rum`][4] to your `package.json` file, then initialize it with:

```javascript
import { datadogRum } from '@datadog/browser-rum';

datadogRum.init({
    applicationId: '<DATADOG_APPLICATION_ID>',
    clientToken: '<DATADOG_CLIENT_TOKEN>',
    site: '<DATADOG_SITE>',
//  service: 'my-web-application',
//  env: 'production',
//  version: '1.0.0',
    sampleRate: 100,
    trackInteractions:true,
});
```

**Note**: The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.

### Bundle

Add the generated code snippet to the head tag (in front of any other script tags) of every HTML page you want to monitor in your application. Including the script tag higher and synchronized ensures Datadog RUM can collect all performance data and errors.

```html
<script
    src="https://www.datadoghq-browser-agent.com/datadog-rum.js"
    type="text/javascript"
></script>
<script>
    window.DD_RUM &&
        window.DD_RUM.init({
            clientToken: '<CLIENT_TOKEN>',
            applicationId: '<APPLICATION_ID>',
            site: '<DATADOG_SITE>',
        //  service: 'my-web-application',
        //  env: 'production',
        //  version: '1.0.0',
            sampleRate: 100,
            trackInteractions:true,
        });
</script>
```

**Notes**:

- The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.
- The `window.DD_RUM` check is used to prevent issues if a loading failure occurs with the RUM SDK.

### TypeScript

Types are compatible with TypeScript >= 3.0. For earlier versions, import JS sources and use global variables to avoid any compilation issues:

```javascript
import '@datadog/browser-rum/bundle/datadog-rum';

window.DD_RUM.init({
  applicationId: 'XXX',
  clientToken: 'XXX',
  site: 'datadoghq.com',
  resourceSampleRate: 100,
  sampleRate: 100
});
```

## Configuration

### Initialization parameters

The following parameters are available:

| Parameter            | Type    | Required | Default         | Description                                                                                                     |
|----------------------|---------|----------|-----------------|-----------------------------------------------------------------------------------------------------------------|
| `applicationId`      | String  | Yes      | ``              | The RUM application ID.                                                                                         |
| `clientToken`        | String  | Yes      | ``              | A [Datadog Client Token][5].                                                                                    |
| `site`               | String  | Yes      | `datadoghq.com` | The Datadog Site of your organization. `datadoghq.com` for Datadog US site, `datadoghq.eu` for Datadog EU site. |
| `service`            | String  | No       | ``              | The service name for this application.                                                                          |
| `env`                | String  | No       | ``              | The application’s environment e.g. prod, pre-prod, staging.                                                     |
| `version`            | String  | No       | ``              | The application’s version e.g. 1.2.3, 6c44da20, 2020.02.13.                                                     |
| `trackInteractions`  | Boolean | No       | `false`         | Enables [automatic collection of Users Actions][6]                                                              |
| `resourceSampleRate` | Number  | No       | `100`           | Percentage of tracked sessions with resources collection. `100` for all, `0` for none of them.                  |
| `sampleRate`         | Number  | No       | `100`           | Percentage of sessions to track. Only tracked sessions send rum events. `100` for all, `0` for none of them.    |
| `silentMultipleInit` | Boolean | No       | `false`         | Initialization fails silently if Datadog's RUM is already initialized on the page                               |
| `proxyHost`          | String  | No       | ``              | Optional proxy URL. See the full [proxy setup guide][7] for more information.                                   |

## Public API

- Init must be called to start the tracking

  - Configurable options:

    - `sampleRate`: percentage of sessions to track. Only tracked sessions send rum events.
    - `resourceSampleRate`: percentage of tracked sessions with resources collection.
    - `site`: The site of the Datadog intake to send SDK data to (default: 'datadoghq.com', set to 'datadoghq.eu' to send data to the EU site)
    - `silentMultipleInit`: prevent logging errors while having multiple Init
    - `trackInteractions`: collect actions initiated by user interactions
    - `service`: name of the corresponding service
    - `env`: environment of the service
    - `version`: version of the service
    - `allowedTracingOrigins`: list of string or regexp of request origins in which to inject tracing headers

  - Options that must have matching configuration when also using `logs` SDK:

    - `trackSessionAcrossSubdomains`: preserve session across subdomains of the same site (default: `false`)
    - `useSecureSessionCookie`: use a secure session cookie. This will disable rum events sending on insecure (non-HTTPS) connections. (default: `false`)
    - `allowThirdPartyContextExecution`: use a secure cross-site session cookie. This will allow the Logs SDK to run when the site is loaded from another one (ex: via an iframe). Implies `useSecureSessionCookie`. (default: `false`)

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
      useSecureSessionCookie?: boolean,
      useCrossSiteSessionCookie?: boolean,
  })
  ```

- Modify the global context

  ```
  addRumGlobalContext (key: string, value: any)  # add one key-value to the default context
  removeRumGlobalContext (key: string)  # remove one key of the default context
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



[1]: https://app.datadoghq.com/rum/list
[2]: /real_user_monitoring/data_collected/
[3]: /real_user_monitoring/dashboards/
[4]: https://www.npmjs.com/package/@datadog/browser-rum
[5]: /account_management/api-app-keys/#client-tokens
[6]: /real_user_monitoring/data_collected/user_action/#automatic-collection-of-user-actions
[7]: /real_user_monitoring/faq/proxy_rum_data/
