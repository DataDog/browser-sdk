# RUM Browser Monitoring - Nuxt integration

**Note**: This integration is in Preview. Features and configuration are subject to change.

## Overview

The Datadog RUM Nuxt integration provides framework-specific instrumentation to help you monitor and debug Nuxt applications. This integration adds:

- **Automatic route change detection** for Nuxt file-based routing
- **View name normalization** that converts dynamic route segments into parameterized names (for example `/user/123` becomes `/user/[id]`)
- **Error reporting** through both Vue's global error handler and Nuxt's `app:error` hook
- **Full-stack visibility** by correlating frontend performance with backend traces and logs

Combined with Datadog RUM's core capabilities, you can debug performance bottlenecks, track user journeys, monitor Core Web Vitals, and analyze every user session with context.

## Setup

Start by setting up [Datadog RUM][1] in your Nuxt application.

After configuration, add the [RUM-Nuxt plugin][2] to the Browser SDK.

This integration requires **Nuxt v3 or v4**, **Vue v3.5+**, and **Vue Router v4+**.

## Basic usage

Create a client-side Nuxt plugin such as `plugins/datadog-rum.client.ts` and initialize the Datadog RUM SDK with `nuxtRumPlugin`:

```ts
import { datadogRum } from '@datadog/browser-rum'
import { nuxtRumPlugin } from '@datadog/browser-rum-nuxt'
import { defineNuxtPlugin, useNuxtApp, useRouter } from 'nuxt/app'

export default defineNuxtPlugin({
  name: 'datadog-rum',
  enforce: 'pre',
  setup() {
    datadogRum.init({
      applicationId: '<APP_ID>',
      clientToken: '<CLIENT_TOKEN>',
      site: 'datadoghq.com',
      plugins: [
        nuxtRumPlugin({
          router: useRouter(),
          nuxtApp: useNuxtApp(),
        }),
      ],
    })
  },
})
```

Using `enforce: 'pre'` lets the plugin capture startup errors reported through Nuxt's `app:error` hook before later plugins run.

Passing `nuxtApp` is optional, but recommended. When provided, the integration automatically reports:

- Vue component errors handled by `vueApp.config.errorHandler`
- Nuxt startup errors reported through `app:error`

## Manual error reporting

If you catch a Nuxt or Vue error yourself and want to report it to Datadog RUM, use `addNuxtError`:

```vue
<script setup lang="ts">
import { onErrorCaptured } from 'vue'
import { addNuxtError } from '@datadog/browser-rum-nuxt'

onErrorCaptured((error, instance, info) => {
  addNuxtError(error, instance, info)
})
</script>
```

## Route tracking

The `nuxtRumPlugin` automatically tracks route changes as RUM views and normalizes dynamic segments to Nuxt-style file route names:

| Actual URL      | View name           |
| --------------- | ------------------- |
| `/about`        | `/about`            |
| `/user/123`     | `/user/[id]`        |
| `/blog/test`    | `/blog/[[slug]]`    |
| `/guides/a/b/c` | `/guides/[...slug]` |

Query string changes do not create a new view, but hash changes do.

## Go further with Datadog Nuxt integration

### Traces

Connect your RUM and trace data to get a complete view of your application's performance. See [Connect RUM and Traces][3].

### Logs

To forward your Nuxt application's logs to Datadog, see [JavaScript Logs Collection][4].

### Metrics

To generate custom metrics from your RUM application, see [Generate Metrics][5].

## Troubleshooting

Need help? Contact [Datadog Support][6].

[1]: https://docs.datadoghq.com/real_user_monitoring/browser/setup/client
[2]: https://www.npmjs.com/package/@datadog/browser-rum-nuxt
[3]: https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum
[4]: https://docs.datadoghq.com/logs/log_collection/javascript/
[5]: https://docs.datadoghq.com/real_user_monitoring/generate_metrics
[6]: https://docs.datadoghq.com/help/
