# RUM Browser Monitoring - Shopify package

## Overview

This package bundles the [RUM slim package](../browser-rum-slim) (no Session Replay, no Real User
Profiling) together with bindings that translate Shopify Web Pixel events into RUM API calls, so
Shopify's Custom Pixel sandbox only needs to load a single script.

Exposes `window.DD_RUM`, same public API as [`@datadog/browser-rum-slim`](../browser-rum-slim),
with `trackViewsManually: true` applied by default so views are driven by the `page_viewed` pixel
event instead of automatic URL-based tracking.

## Setup

See the [RUM package](../rum/README.md) documentation for `init()` options.
