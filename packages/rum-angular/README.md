# RUM Browser Monitoring - Angular integration

**Note**: This integration is in Preview. Features and configuration are subject to change.

## Overview

The Datadog RUM Angular integration provides framework-specific instrumentation to help you monitor and debug Angular applications. This integration adds:

- **Automatic route change detection** using Angular Router
- **View name normalization** that maps dynamic route segments to their parameterized definitions (e.g. `/users/123` becomes `/users/:id`)
- **Full-stack visibility** by correlating frontend performance with backend traces and logs

Combined with Datadog RUM's core capabilities, you can debug performance bottlenecks, track user journeys, monitor Core Web Vitals, and analyze every user session with context.

## Setup

Start by setting up [Datadog RUM][1] in your Angular application:

- If you are creating a RUM application, select **Angular** as the application type.
- If Angular is not available as an option, select **JavaScript** and follow the steps below to integrate the plugin manually.

After configuration, the Datadog App provides instructions for integrating the [RUM-Angular plugin][2] with the Browser SDK.

This integration requires **Angular v17+** and **Angular Router** (if using router view tracking).

## Basic usage

### 1. Initialize the Datadog RUM SDK with the Angular plugin

In your `main.ts`:

```ts
import { datadogRum } from '@datadog/browser-rum'
import { angularPlugin } from '@datadog/browser-rum-angular'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [angularPlugin()],
})
```

## Router view tracking

To automatically track route changes as RUM views, enable the `router` option in the plugin and register the Datadog router provider.

### 1. Initialize the RUM SDK with router tracking enabled

```ts
import { datadogRum } from '@datadog/browser-rum'
import { angularPlugin } from '@datadog/browser-rum-angular'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [angularPlugin({ router: true })],
})
```

### 2. Register the Datadog router provider

In your `app.config.ts` (or `main.ts` for standalone apps):

```ts
import { ApplicationConfig } from '@angular/core'
import { provideRouter } from '@angular/router'
import { provideDatadogRouter } from '@datadog/browser-rum-angular'
import { routes } from './app.routes'

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideDatadogRouter(),
  ],
}
```

### 3. Wire everything together

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser'
import { datadogRum } from '@datadog/browser-rum'
import { angularPlugin } from '@datadog/browser-rum-angular'
import { AppComponent } from './app/app.component'
import { appConfig } from './app/app.config'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [angularPlugin({ router: true })],
})

bootstrapApplication(AppComponent, appConfig)
```

## Route tracking

The `provideDatadogRouter()` provider automatically tracks route changes and normalizes dynamic segments into parameterized view names:

| Actual URL             | View name                  |
| ---------------------- | -------------------------- |
| `/about`               | `/about`                   |
| `/users/123`           | `/users/:id`               |
| `/users/123/posts/456` | `/users/:id/posts/:postId` |
| `/docs/a/b/c`          | `/docs/a/b/c` (catch-all)  |

## SSR compatibility

The integration is compatible with Angular SSR (`@angular/ssr`). The `provideDatadogRouter()` provider detects the platform and skips router event subscription on the server. No additional configuration is needed.

## Go further with Datadog Angular integration

### Traces

Connect your RUM and trace data to get a complete view of your application's performance. See [Connect RUM and Traces][3].

### Logs

To forward your Angular application's logs to Datadog, see [JavaScript Logs Collection][4].

### Metrics

To generate custom metrics from your RUM application, see [Generate Metrics][5].

## Troubleshooting

Need help? Contact [Datadog Support][6].

[1]: https://docs.datadoghq.com/real_user_monitoring/browser/setup/client
[2]: https://www.npmjs.com/package/@datadog/browser-rum-angular
[3]: https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum
[4]: https://docs.datadoghq.com/logs/log_collection/javascript/
[5]: https://docs.datadoghq.com/real_user_monitoring/generate_metrics
[6]: https://docs.datadoghq.com/help/
