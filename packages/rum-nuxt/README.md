# RUM Browser Monitoring - Nuxt integration

**Note**: This integration is in Preview. Features and configuration are subject to change.

## Overview

The Datadog RUM Nuxt integration provides framework-specific instrumentation for Nuxt 3 and 4 applications. This integration adds:

- Automatic route change detection using the Nuxt router
- View name normalization for dynamic Nuxt routes such as `/user/42` to `/user/[id]`
- Error reporting for client-side Vue errors and Nuxt app-level startup errors

This package is client-only. Use it from a Nuxt `.client` plugin. Server-side SSR rendering errors and server-startup failures are out of scope because `.client` plugins only run in the browser.

## Setup

Create a client plugin in `app/plugins/datadog-rum.client.ts`:

```ts
import { datadogRum } from '@datadog/browser-rum'
import { nuxtRumPlugin } from '@datadog/browser-rum-nuxt'

export default defineNuxtPlugin((nuxtApp) => {
  datadogRum.init({
    applicationId: '<APP_ID>',
    clientToken: '<CLIENT_TOKEN>',
    site: 'datadoghq.com',
    plugins: [nuxtRumPlugin({ router: useRouter(), nuxtApp })],
  })
})
```

## Error Reporting

Passing `nuxtApp` to `nuxtRumPlugin` automatically wires up both Nuxt error surfaces:

- `vueApp.config.errorHandler` — captures client-side Vue errors with component context (instance, info).
- `app:error` — captures client-side Nuxt app/plugin startup failures that reach Nuxt's app-level error hook.

Because this package is client-only, it does not report SSR-side `app:error` or server startup failures.

## Route Tracking

The `nuxtRumPlugin({ router: useRouter() })` plugin tracks client-side route changes and normalizes dynamic routes:

| Actual URL  | View name           |
| ----------- | ------------------- |
| `/`         | `/`                 |
| `/user/42`  | `/user/[id]`        |
| `/guides/a` | `/guides/[...slug]` |
