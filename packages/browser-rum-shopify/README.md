# RUM Browser Monitoring - Shopify package

## Overview

This package bundles the RUM SDK together with a `shopifyPlugin` that translates Shopify Web
Pixel events into RUM API calls, so Shopify's Custom Pixel sandbox only needs to load a single
script.

Exposes `window.DD_RUM`, same public API as [`@datadog/browser-rum`](../rum), plus
`DD_RUM.shopifyPlugin(configuration)`.

## Setup

In a Custom Pixel, pass the sandbox's `analytics` global to the plugin:

```javascript
DD_RUM.onReady(function () {
  DD_RUM.init({
    applicationId: '<YOUR_DATADOG_APPLICATION_ID>',
    clientToken: '<YOUR_DATADOG_CLIENT_TOKEN>',
    site: '<YOUR_DATADOG_SITE>',
    service: '<YOUR_SERVICE_NAME>',
    env: '<YOUR_ENV_NAME>',
    version: '1.0.0',
    sessionSampleRate: 100,
    plugins: [DD_RUM.shopifyPlugin({ shopifyAnalytics: analytics })],
  })
})
```

The plugin patches sandboxed iframe APIs, wires Shopify Web Pixel events to the RUM public API,
and forces configuration suited to the Pixel sandbox (e.g. `trackViewsManually: true`,
`sessionReplaySampleRate: 0`).

On storefront pages (outside the Pixel sandbox), don't include the plugin — see the
[RUM package](../rum/README.md) documentation for `init()` options.
