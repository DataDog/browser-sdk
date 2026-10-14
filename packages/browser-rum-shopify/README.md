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

Copy the locally built bundle into the extension's
`src` directory and import it from `src/index.js`:

```js
import './datadog-rum-shopify-web-pixel.js'
```

The bundle calls Shopify's `register` once and initializes RUM from `settings.rumConfig` (a JSON
string). The extension must not call `register` or `DD_RUM_WEB_PIXEL.init` itself. This registration
flow is currently available in the local build used by the PoC.

The registration callback captures `browser.cookie` in an internal session store factory. The factory
is supplied directly to the shared session manager, outside public initialization configuration;
no cookie API is passed through `sessionPersistence`. Cookie authorization,
serialization and expiry reuse the shared cookie session store, with a Shopify-specific async cookie adapter. Cookie access starts only on
checkout after consent. If cookie access fails, collection stays disabled instead of falling back
to an unrelated in-memory session.

By default, data is only collected once the visitor consents to analytics, following Shopify's
[customer privacy][4] status. Set `bypassCustomerPrivacy: true` to collect regardless of consent;
the pixel extension must then declare no privacy purposes, or Shopify won't run it without consent.

See the [dedicated Datadog documentation][1] for the installation process.

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/integrations/rum-shopify
[2]: https://www.npmjs.com/package/@datadog/browser-rum
[3]: https://shopify.dev/docs/apps/build/marketing/build-web-pixels
[4]: https://shopify.dev/docs/api/web-pixels-api/pixel-privacy
