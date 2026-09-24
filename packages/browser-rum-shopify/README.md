# RUM Browser Monitoring - Shopify package

## Overview

This package bundles the Datadog RUM Browser SDK together with a `shopifyPlugin` that translates
Shopify Web Pixel events into RUM API calls, so a Shopify Custom Pixel only needs to load a
single script.

Exposes `window.DD_RUM`, the same public API as [`@datadog/browser-rum`][2], plus
`DD_RUM.shopifyPlugin(configuration)`.

See the [dedicated Datadog documentation][1] for the installation process.

<!-- Note: all URLs should be absolute -->

[1]: https://docs.datadoghq.com/integrations/rum-shopify
[2]: https://www.npmjs.com/package/@datadog/browser-rum
