# RUM Browser Monitoring - Shopify package

## Overview

Datadog RUM for Shopify stores. This package provides two entry points:

- **Storefront** (`datadog-rum-shopify.js` bundle): the Datadog RUM Browser SDK, loaded on
  storefront (Liquid theme) pages. Exposes `window.DD_RUM`, the same public API as
  [`@datadog/browser-rum`][2].
- **Checkout** (`@datadog/browser-rum-shopify/web-pixel`): a lightweight SDK for a Shopify
  [Web Pixel app extension][3], which runs in a sandboxed Web Worker without DOM access. It turns
  Shopify checkout events into RUM views, actions and errors, attached to the session shared with
  the storefront.

```js
import { register } from '@shopify/web-pixels-extension'
import { startWebPixelRum } from '@datadog/browser-rum-shopify/web-pixel'

register(({ analytics, browser, settings }) => {
  startWebPixelRum(JSON.parse(settings.rumConfig), { analytics, browser })
})
```

See the [dedicated Datadog documentation][1] for the installation process.

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/integrations/rum-shopify
[2]: https://www.npmjs.com/package/@datadog/browser-rum
[3]: https://shopify.dev/docs/apps/build/marketing/build-web-pixels
