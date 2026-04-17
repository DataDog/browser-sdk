# RUM Browser Monitoring - SvelteKit integration

**Note**: This integration is in Preview. Features and configuration are subject to change.

## Overview

The Datadog RUM SvelteKit integration provides framework-specific instrumentation to help you
monitor and debug SvelteKit applications. This integration adds:

- **Automatic route change detection** using SvelteKit's `afterNavigate` lifecycle hook
- **View name normalization** that maps actual URLs to their parameterized `route.id` (e.g. `/blog/hello` becomes `/blog/[slug]`)
- **Full-stack visibility** by correlating frontend performance with backend traces and logs

Combined with Datadog RUM's core capabilities, you can debug performance bottlenecks, track user
journeys, monitor Core Web Vitals, and analyze every user session with context.

## Setup

Start by setting up [Datadog RUM][1] in your SvelteKit application:

- If you are creating a RUM application, select **JavaScript** as the application type.
- After configuration, install `@datadog/browser-rum-sveltekit` alongside `@datadog/browser-rum`.

This integration requires **SvelteKit v2.12+** and **Svelte v5+**.

## Basic usage

### 1. Initialize the Datadog RUM SDK with the SvelteKit plugin

In your root `src/routes/+layout.svelte` (or a dedicated client-only module), gate the
initialization behind the `browser` flag so the SDK is not loaded during server-side rendering:

```svelte
<script lang="ts">
  import { browser } from '$app/environment'
  import { datadogRum } from '@datadog/browser-rum'
  import { svelteKitPlugin } from '@datadog/browser-rum-sveltekit'

  if (browser) {
    datadogRum.init({
      applicationId: '<APP_ID>',
      clientToken: '<CLIENT_TOKEN>',
      site: 'datadoghq.com',
      plugins: [svelteKitPlugin({ router: true })],
    })
  }
</script>

<slot />
```

## Router view tracking

To automatically track route changes as RUM views, enable the `router` option in the plugin and
mount the `DatadogRumRouter` renderless component in your root layout:

```svelte
<script lang="ts">
  import { browser } from '$app/environment'
  import { datadogRum } from '@datadog/browser-rum'
  import { svelteKitPlugin } from '@datadog/browser-rum-sveltekit'
  import DatadogRumRouter from '@datadog/browser-rum-sveltekit/sveltekit-router/DatadogRumRouter.svelte'

  if (browser) {
    datadogRum.init({
      applicationId: '<APP_ID>',
      clientToken: '<CLIENT_TOKEN>',
      site: 'datadoghq.com',
      plugins: [svelteKitPlugin({ router: true })],
    })
  }
</script>

<DatadogRumRouter />
<slot />
```

`DatadogRumRouter` renders nothing; it subscribes to SvelteKit's `afterNavigate` hook during
component initialization. Place it once, in your root layout.

### Alternative: imperative subscription

If you already have a `+layout.svelte` that calls `afterNavigate`, you can wire in the tracker
directly instead of mounting the component:

```svelte
<script lang="ts">
  import { afterNavigate } from '$app/navigation'
  import { trackSvelteKitNavigation } from '@datadog/browser-rum-sveltekit/sveltekit-router'

  afterNavigate(trackSvelteKitNavigation)
</script>
```

## Route tracking

SvelteKit exposes `page.route.id` — a string that mirrors the filesystem route pattern including
bracket syntax, matchers, optional/rest segments, and route groups. The integration uses that
value verbatim as the RUM view name, so distinct URLs sharing a route collapse to a single view.

| Actual URL                                | View name                               |
| ----------------------------------------- | --------------------------------------- |
| `/about`                                  | `/about`                                |
| `/blog/hello-world`                       | `/blog/[slug]`                          |
| `/home` or `/en/home`                     | `/[[lang]]/home`                        |
| `/sveltejs/kit/tree/main/docs/routing.md` | `/[org]/[repo]/tree/[branch]/[...file]` |
| `/fruits/apple`                           | `/fruits/[page=fruit]`                  |
| `/dashboard`                              | `/(app)/dashboard`                      |

When no route matches (e.g. 404), the integration falls back to the URL pathname.

## Go further with Datadog SvelteKit integration

### Traces

Connect your RUM and trace data to get a complete view of your application's performance. See
[Connect RUM and Traces][2].

### Logs

To forward your SvelteKit application's logs to Datadog, see [JavaScript Logs Collection][3].

## Troubleshooting

Need help? Contact [Datadog Support][4].

[1]: https://docs.datadoghq.com/real_user_monitoring/browser/setup/client
[2]: https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum
[3]: https://docs.datadoghq.com/logs/log_collection/javascript/
[4]: https://docs.datadoghq.com/help/
