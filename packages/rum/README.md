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
import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  applicationId: '<DATADOG_APPLICATION_ID>',
  clientToken: '<DATADOG_CLIENT_TOKEN>',
  site: '<DATADOG_SITE>',
  //  service: 'my-web-application',
  //  env: 'production',
  //  version: '1.0.0',
  sampleRate: 100,
  trackInteractions: true,
})
```

**Note**: The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.

### Bundle

Add the generated code snippet to the head tag (in front of any other script tags) of every HTML page you want to monitor in your application. Including the script tag higher and synchronized ensures Datadog RUM can collect all performance data and errors.

```html
<script src="https://www.datadoghq-browser-agent.com/datadog-rum.js" type="text/javascript"></script>
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
      trackInteractions: true,
    })
</script>
```

**Notes**:

- The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.
- The `window.DD_RUM` check is used to prevent issues if a loading failure occurs with the RUM SDK.

### TypeScript

Types are compatible with TypeScript >= 3.0. For earlier versions, import JS sources and use global variables to avoid any compilation issues:

```javascript
import '@datadog/browser-rum/bundle/datadog-rum'

window.DD_RUM.init({
  applicationId: 'XXX',
  clientToken: 'XXX',
  site: 'datadoghq.com',
  resourceSampleRate: 100,
  sampleRate: 100,
})
```

## Configuration

### Initialization parameters

The following parameters are available:

| Parameter               | Type    | Required | Default         | Description                                                                                              |
| ----------------------- | ------- | -------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `applicationId`         | String  | Yes      |                 | The RUM application ID.                                                                                  |
| `clientToken`           | String  | Yes      |                 | A [Datadog client token][5].                                                                             |
| `site`                  | String  | Yes      | `datadoghq.com` | The Datadog site of your organization. US: `datadoghq.com`, EU: `datadoghq.eu`                           |
| `service`               | String  | No       |                 | The service name for your application.                                                                   |
| `env`                   | String  | No       |                 | The application’s environment, for example: prod, pre-prod, staging, etc.                                |
| `version`               | String  | No       |                 | The application’s version, for example: 1.2.3, 6c44da20, 2020.02.13, etc.                                |
| `trackInteractions`     | Boolean | No       | `false`         | Enables [automatic collection of users actions][6].                                                      |
| `resourceSampleRate`    | Number  | No       | `100`           | The percentage of tracked sessions with resources collection: `100` for all, `0` for none.               |
| `sampleRate`            | Number  | No       | `100`           | The percentage of sessions to track: `100` for all, `0` for none. Only tracked sessions send rum events. |
| `silentMultipleInit`    | Boolean | No       | `false`         | Initialization fails silently if Datadog's RUM is already initialized on the page.                       |
| `proxyHost`             | String  | No       |                 | Optional proxy host (ex: www.proxy.com), see the full [proxy setup guide][7] for more information.       |
| `allowedTracingOrigins` | List    | No       |                 | A list of request origins used to inject tracing headers.                                                |

Options that must have matching configuration when also using `logs` SDK:

| Parameter                      | Type    | Required | Default | Description                                                                                                                                                  |
| ------------------------------ | ------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trackSessionAcrossSubdomains` | Boolean | No       | `false` | Preserve the session across subdomains for the same site.                                                                                                    |
| `useSecureSessionCookie`       | Boolean | No       | `false` | Use a secure session cookie. This disables RUM events sent on insecure (non-HTTPS) connections.                                                              |
| `useCrossSiteSessionCookie`    | Boolean | No       | `false` | Use a secure cross-site session cookie. This allows the logs SDK to run when the site is loaded from another one (iframe). Implies `useSecureSessionCookie`. |

#### Example

Init must be called to start the tracking:

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

### Name click actions

The RUM library uses various strategies to automatically name click actions. If you want more control, define a `data-dd-action-name` attribute on clickable elements (or any of their parents) to name the action, for example:

```html
<a class="btn btn-default" href="#" role="button" data-dd-action-name="Login button">Login</a>
```

```html
<div class="alert alert-danger" role="alert" data-dd-action-name="Dismiss alert">
  <span class="glyphicon glyphicon-exclamation-sign" aria-hidden="true"></span>
  <span class="sr-only">Error:</span>
  Enter a valid email address
</div>
```

[1]: https://app.datadoghq.com/rum/list
[2]: https://docs.datadoghq.com/real_user_monitoring/data_collected/
[3]: https://docs.datadoghq.com/real_user_monitoring/dashboards/
[4]: https://www.npmjs.com/package/@datadog/browser-rum
[5]: https://docs.datadoghq.com/account_management/api-app-keys/#client-tokens
[6]: https://docs.datadoghq.com/real_user_monitoring/data_collected/user_action/#automatic-collection-of-user-actions
[7]: https://docs.datadoghq.com/real_user_monitoring/faq/proxy_rum_data/
