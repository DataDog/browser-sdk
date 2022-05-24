# RUM Browser Monitoring

## Overview

Datadog Real User Monitoring (RUM) enables you to visualize and analyze the real-time performance and user journeys of your application's individual users.

## Setup

To set up Datadog RUM browser monitoring:

1. In Datadog, navigate to the [Real User Monitoring page][1] and click the **New Application** button.
2. Enter a name for your application and click **Generate Client Token**. This generates a `clientToken` and an `applicationId` for your application.
3. Setup the Datadog RUM SDK via [npm](#npm) or via one of the hosted versions: [CDN async](#cdn-async) or [CDN sync](#cdn-sync).
4. Deploy the changes to your application. Once your deployment is live, Datadog collects events from user browsers.
5. Visualize the [data collected][2] using Datadog [dashboards][3].

**Note**: Your application shows up on the application list page as "pending" until Datadog starts receiving data.

**Supported browsers**: The RUM SDK supports all modern desktop and mobile browsers including IE11. See the [browser support][8] table.

### Choose the right installation method

npm (node package manager)
: This method is recommended for modern web applications. The RUM SDK gets packaged with the rest of your front-end javascript code. It has no impact on page load performance. However, the SDK might miss errors, resources and user actions triggered before the SDK is initialized. **Note:** it is recommended to use a matching version with logs SDK if used.

CDN async
: This method is recommended for web applications with performance targets. The RUM SDK is loaded from our CDN asynchronously: this method ensures the SDK download does not impact page load performance. However, the SDK might miss errors, resources and user actions triggered before the SDK is initialized.

CDN sync
: This method is recommended for collecting all RUM events. The RUM SDK is loaded from our CDN synchronously: this method ensures the SDK is loaded first and collects all errors, resources and user actions. This method might impact page load performance.

### npm

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
  premiumSampleRate: 100, // if not included - default 100
  trackInteractions: true,
})
```

**Note**: The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.

### CDN async

Add the generated code snippet to the head tag of every HTML page you want to monitor in your application.

<!-- prettier-ignore -->
```html
<script>
 (function(h,o,u,n,d) {
   h=h[d]=h[d]||{q:[],onReady:function(c){h.q.push(c)}}
   d=o.createElement(u);d.async=1;d.src=n
   n=o.getElementsByTagName(u)[0];n.parentNode.insertBefore(d,n)
})(window,document,'script','https://www.datadoghq-browser-agent.com/datadog-rum-v4.js','DD_RUM')
  DD_RUM.onReady(function() {
    DD_RUM.init({
      clientToken: '<CLIENT_TOKEN>',
      applicationId: '<APPLICATION_ID>',
      site: '<DATADOG_SITE>',
      //  service: 'my-web-application',
      //  env: 'production',
      //  version: '1.0.0',
      sampleRate: 100,
      premiumSampleRate: 100, // if not included - default 100
      trackInteractions: true,
    })
  })
</script>
```

**Notes**:

- The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.
- Early RUM API calls must be wrapped in the `DD_RUM.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

### CDN sync

Add the generated code snippet to the head tag (in front of any other script tags) of every HTML page you want to monitor in your application. Including the script tag higher and synchronized ensures Datadog RUM can collect all performance data and errors.

```html
<script src="https://www.datadoghq-browser-agent.com/datadog-rum-v4.js" type="text/javascript"></script>
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
      premiumSampleRate: 100, // if not included - default 100
      trackInteractions: true,
    })
</script>
```

**Notes**:

- The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.
- The `window.DD_RUM` check is used to prevent issues if a loading failure occurs with the RUM SDK.

### TypeScript

Types are compatible with TypeScript >= 3.8.2. For earlier versions, import JS sources and use global variables to avoid any compilation issues:

```javascript
import '@datadog/browser-rum/bundle/datadog-rum'

window.DD_RUM.init({
  applicationId: 'XXX',
  clientToken: 'XXX',
  site: 'datadoghq.com',
  sampleRate: 100,
})
```

## Configuration

### Initialization parameters

The following parameters are available:

`applicationId`
: Required<br/>
**Type**: String<br/>
The RUM application ID.

`clientToken`
: Required<br/>
**Type**: String<br/>
A [Datadog client token][5].

`site`
: Required<br/>
**Type**: String<br/>
**Default**: `datadoghq.com`<br/>
The Datadog site of your organization, same value as [agent site configuration][14].

`service`
: Optional<br/>
**Type**: String<br/>
The service name for your application. It should follow the [tag syntax requirements][15].

`env`
: Optional<br/>
**Type**: String<br/>
The application’s environment, for example: prod, pre-prod, staging, etc. It should follow the [tag syntax requirements][15].

`version`
: Optional<br/>
**Type**: String<br/>
The application’s version, for example: 1.2.3, 6c44da20, 2020.02.13, etc. It should follow the [tag syntax requirements][15].

`trackViewsManually`
: Optional<br/>
**Type**: Boolean<br/>
**Default**: `false` <br/>
Allows you to control RUM views creation. See [override default RUM view names][10].

`trackInteractions`
: Optional<br/>
**Type**: Boolean<br/>
**Default**: `false` <br/>
Enables [automatic collection of users actions][6].

`defaultPrivacyLevel`
: Optional<br/>
**Type**: String<br/>
**Default**: `mask-user-input` <br/>
See [Session Replay Privacy Options][13].

`actionNameAttribute`
: Optional<br/>
**Type**: String<br/>
Specify your own attribute to be used to [name actions][9].

`sampleRate`
: Optional<br/>
**Type**: Number<br/>
**Default**: `100`<br/>
The percentage of sessions to track: `100` for all, `0` for none. Only tracked sessions send RUM events. For more details about `sampleRate`, see the [sampling configuration](#browser-rum-and-rum-premium-sampling-configuration).

`replaySampleRate`
: Optional - **Deprecated**<br/>
**Type**: Number<br/>
**Default**: `100`<br/>
See `premiumSampleRate`.

`premiumSampleRate`
: Optional<br/>
**Type**: Number<br/>
**Default**: `100`<br/>
The percentage of tracked sessions with [Premium pricing][11] features: `100` for all, `0` for none. For more details about `premiumSampleRate`, see the [sampling configuration](#browser-rum-and-rum-premium-sampling-configuration).

`silentMultipleInit`
: Optional<br/>
**Type**: Boolean <br/>
**Default**: `false`<br/>
Initialization fails silently if Datadog's RUM is already initialized on the page.

`proxyUrl`
: Optional<br/>
**Type**: String<br/>
Optional proxy URL (ex: https://www.proxy.com/path), see the full [proxy setup guide][7] for more information.

`allowedTracingOrigins`
: Optional<br/>
**Type**: List<br/>
A list of request origins used to inject tracing headers. See [Connect RUM and Traces][12].

`tracingSampleRate`
: Optional<br/>
**Type**: Number<br/>
**Default**: `100`<br/>
The percentage of requests to trace: `100` for all, `0` for none. See [Connect RUM and Traces][12].

`telemetrySampleRate`
: Optional<br/>
**Type**: Number<br/>
**Default**: `20`<br/>
Telemetry data (error, debug logs) about SDK execution is sent to Datadog in order to detect and solve potential issues. Set this option to `0` to opt out from telemetry collection.

`excludedActivityUrls`
: Optional<br/>
**Type:** List<br/>
A list of request origins ignored when computing the page activity. See [How page activity is calculated][16].

Options that must have matching configuration when also using `logs` SDK:

`trackSessionAcrossSubdomains`
: Optional<br/>
**Type**: Boolean<br/>
**Default**: `false`<br/>
Preserve the session across subdomains for the same site.

`useSecureSessionCookie`
: Optional<br/>
**Type**: Boolean<br/>
**Default**: `false`<br/>
Use a secure session cookie. This disables RUM events sent on insecure (non-HTTPS) connections.

`useCrossSiteSessionCookie`
: Optional<br/>
**Type**: Boolean<br/>
**Default**:`false`<br/>
Use a secure cross-site session cookie. This allows the RUM SDK to run when the site is loaded from another one (iframe). Implies `useSecureSessionCookie`.

#### Example

Init must be called to start the tracking:

```
init(configuration: {
    applicationId: string,
    clientToken: string,
    site?: string,
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

### Browser RUM and RUM Premium sampling configuration

**Note**: This feature requires SDK v3.6.0+.

When new session is created, it can be either tracked as:

- [**Browser RUM**][11]: **Only** _Sessions_, _Views_, _Actions_, and _Errors_ are collected. Calls to `startSessionReplayRecording()` are ignored.
- [**RUM Premium**][11]: Everything from Browser RUM plus _Resources_, _Long Tasks_, and _Replay_ recordings are collected. A call to `startSessionReplayRecording()` is needed to collect _Replay_ recordings.

Two initialization parameters are available to control how the session is tracked:

- `sampleRate` controls the percentage of overall sessions being tracked. It defaults to `100%`, so every sessions will be tracked by default.

- `premiumSampleRate` is applied **after** the overall sample rate, and controls the percentage of sessions tracked as RUM Premium. It defaults to `100%`, so every sessions will be tracked as RUM Premium by default.

For example, to track 100% of your sessions as Browser RUM:

```
datadogRum.init({
    ....
    sampleRate: 100,
    premiumSampleRate: 0
});
```

For example, to track 100% of your sessions as RUM Premium:

```
datadogRum.init({
    ....
    sampleRate: 100,
    premiumSampleRate: 100
});
```

For example, to track only 50% of your overall sessions, with half tracked as Browser RUM and the other half tracked as RUM Premium, set the `sampleRate` and the `premiumSampleRate` to 50:

```
datadogRum.init({
    ....
    sampleRate: 50,
    premiumSampleRate: 50
});
```

## Further Reading

{{< partial name="whats-next/whats-next.html" >}}

<!-- Note: all URLs should be absolute -->

[1]: https://app.datadoghq.com/rum/list
[2]: https://docs.datadoghq.com/real_user_monitoring/data_collected/
[3]: https://docs.datadoghq.com/real_user_monitoring/dashboards/
[4]: https://www.npmjs.com/package/@datadog/browser-rum
[5]: https://docs.datadoghq.com/account_management/api-app-keys/#client-tokens
[6]: https://docs.datadoghq.com/real_user_monitoring/browser/tracking_user_actions
[7]: https://docs.datadoghq.com/real_user_monitoring/faq/proxy_rum_data/
[8]: https://github.com/DataDog/browser-sdk/blob/main/packages/rum/BROWSER_SUPPORT.md
[9]: https://docs.datadoghq.com/real_user_monitoring/browser/tracking_user_actions#declaring-a-name-for-click-actions
[10]: https://docs.datadoghq.com/real_user_monitoring/browser/modifying_data_and_context/?tab=npm#override-default-rum-view-names
[11]: https://www.datadoghq.com/pricing/?product=real-user-monitoring#real-user-monitoring
[12]: https://docs.datadoghq.com/real_user_monitoring/connect_rum_and_traces?tab=browserrum
[13]: https://docs.datadoghq.com/real_user_monitoring/session_replay/privacy_options?tab=maskuserinput
[14]: https://docs.datadoghq.com/agent/basic_agent_usage#datadog-site
[15]: https://docs.datadoghq.com/getting_started/tagging/#defining-tags
[16]: https://docs.datadoghq.com/real_user_monitoring/browser/monitoring_page_performance/#how-page-activity-is-calculated
