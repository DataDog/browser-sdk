# RUM Browser Monitoring - Shopify package

## Overview

This package bundles the Datadog RUM Browser SDK together with a `shopifyPlugin` that translates
Shopify Web Pixel events into RUM API calls, so a Shopify Custom Pixel only needs to load a
single script.

Exposes `window.DD_RUM`, the same public API as [`@datadog/browser-rum`][2], plus
`DD_RUM.shopifyPlugin(configuration)`.

## Web Pixel app extension

The `datadog-rum-shopify-web-pixel.js` bundle is a lightweight SDK for a Shopify
[Web Pixel app extension][3], which runs in a sandboxed Web Worker without DOM access. It turns
Shopify checkout events into RUM views, actions and errors, attached to the session shared with
the storefront through the top frame cookies.

```js
import { register } from '@shopify/web-pixels-extension'

register(({ analytics, browser, settings }) => {
  importScripts('https://www.datadoghq-browser-agent.com/us1/v7/datadog-rum-shopify-web-pixel.js')
  self.DD_RUM_WEB_PIXEL.init(JSON.parse(settings.rumConfig), { analytics, browser })
})
```

See the [dedicated Datadog documentation][1] for the installation process.

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/integrations/rum-shopify
[2]: https://www.npmjs.com/package/@datadog/browser-rum
[3]: https://shopify.dev/docs/apps/build/marketing/build-web-pixels
