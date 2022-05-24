# RUM Browser Monitoring

## Overview

Datadog Real User Monitoring (RUM) enables you to visualize and analyze the real-time performance and user journeys of your application's individual users.

## Setup

The RUM Browser SDK supports all modern desktop and mobile browsers including IE11. For more information, see the [Browser Support][8] table.

To set up RUM Browser Monitoring:

1. In Datadog, navigate to the [**RUM Applications** page][1] and click the **New Application** button.
2. Enter a name for your application and click **Generate Client Token**. This generates a `clientToken` and an `applicationId` for your application.
3. Setup the RUM Browser SDK with [npm](#npm) or a hosted version ([CDN async](#cdn-async) or [CDN sync](#cdn-sync)).
4. Deploy the changes to your application. Once your deployment is live, Datadog collects events from your users' browsers.
5. Visualize the [data collected][2] in [dashboards][3] or create a search query in the [RUM Explorer][16].

Until Datadog starts to receive data, your application appears as "pending" on the **RUM Applications** page.

### Choose the right installation method

npm (node package manager)
: This method is recommended for modern web applications. The RUM Browser SDK is packaged with the rest of your front-end JavaScript code. It has no impact on page load performance. However, the SDK may miss errors, resources, and user actions triggered before the SDK is initialized. Datadog recommends using a matching version with the Browser Logs SDK if you are collecting logs.

CDN async
: This method is recommended for web applications with performance targets. The RUM Browser SDK loads from our CDN asynchronously, ensuring the SDK download does not impact page load performance. However, the SDK may miss errors, resources, and user actions triggered before the SDK is initialized.

CDN sync
: This method is recommended for collecting all RUM events. The RUM Browser SDK loads from our CDN synchronously, ensuring the SDK loads first and collects all errors, resources, and user actions. This method may impact page load performance.

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

The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.

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

The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.

Early RUM API calls must be wrapped in the `DD_RUM.onReady()` callback. This ensures the code only gets executed once the SDK is properly loaded.

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

The `trackInteractions` parameter enables the automatic collection of user clicks in your application. **Sensitive and private data** contained on your pages may be included to identify the elements interacted with.

The `window.DD_RUM` check is used to prevent issues if a loading failure occurs with the RUM Browser SDK.

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
The Datadog site of your organization, the same value as the [Agent site configuration][14].

`service`
: Optional<br/>
**Type**: String<br/>
The service name for your application. Follows the [tag syntax requirements][15].

`env`
: Optional<br/>
**Type**: String<br/>
The application’s environment, for example: prod, pre-prod, and staging. Follows the [tag syntax requirements][15].

`version`
: Optional<br/>
**Type**: String<br/>
The application’s version, for example: 1.2.3, 6c44da20, and 2020.02.13. Follows the [tag syntax requirements][15].

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
Initialization fails silently if the RUM Browser SDK is already initialized on the page.

`proxyUrl`
: Optional<br/>
**Type**: String<br/>
Optional proxy URL, for example: https://www.proxy.com/path. For more information, see the full [proxy setup guide][7].

`allowedTracingOrigins`
: Optional<br/>
**Type**: List<br/>
A list of request origins used to inject tracing headers. For more information, see [Connect RUM and Traces][12].

`tracingSampleRate`
: Optional<br/>
**Type**: Number<br/>
**Default**: `100`<br/>
The percentage of requests to trace: `100` for all, `0` for none. For more information, see [Connect RUM and Traces][12].

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
Use a secure cross-site session cookie. This allows the RUM Browser SDK to run when the site is loaded from another one (iframe). Implies `useSecureSessionCookie`.

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

This feature requires the RUM Browser SDK v3.6.0+.

When a new session is created, it can be tracked as either:

- [**Browser RUM**][11]: Only _Sessions_, _Views_, _Actions_, and _Errors_ are collected. Calls to `startSessionReplayRecording()` are ignored.
- [**RUM Premium**][11]: Everything from Browser RUM, including _Resources_, _Long Tasks_, and _Replay_ recordings are collected. To collect _Replay_ recordings, call `startSessionReplayRecording()`.

Two initialization parameters are available to control how the session is tracked:

- `sampleRate` controls the percentage of overall sessions being tracked. It defaults to `100%`, so every sessions is tracked by default.
- `premiumSampleRate` is applied **after** the overall sample rate, and controls the percentage of sessions tracked as RUM Premium. It defaults to `100%`, so every sessions is tracked as RUM Premium by default.

To track 100% of your sessions as Browser RUM:

```
datadogRum.init({
    ....
    sampleRate: 100,
    premiumSampleRate: 0
});
```

To track 100% of your sessions as RUM Premium:

```
datadogRum.init({
    ....
    sampleRate: 100,
    premiumSampleRate: 100
});
```

For example, to track only 50% of your overall sessions with half tracked as Browser RUM and the other half tracked as RUM Premium, set the `sampleRate` and the `premiumSampleRate` to 50:

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
