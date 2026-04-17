# RUM Browser Monitoring - Angular integration

**Note**: This integration is in Preview. Features and configuration are subject to change.

## Overview

The Datadog RUM Angular integration provides framework-specific instrumentation to help you monitor and debug Angular applications. This integration adds:

- **Automatic route change detection** using Angular Router
- **View name normalization** that maps dynamic route segments to their parameterized definitions (e.g. `/users/123` becomes `/users/:id`)
- **Full-stack visibility** by correlating frontend performance with backend traces and logs

Combined with Datadog RUM's core capabilities, you can debug performance bottlenecks, track user journeys, monitor Core Web Vitals, and analyze every user session with context.

## Setup

Start by setting up [Datadog RUM][1] in your Angular application.

This integration requires **Angular 17+**.

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

To automatically track route changes as RUM views, enable the `router` option in the plugin and register the Datadog router providers alongside `provideRouter()`.

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

### 2. Register the Datadog router providers

Add `provideDatadogRouter()` to your `bootstrapApplication` providers, next to `provideRouter()`:

```ts
import { bootstrapApplication } from '@angular/platform-browser'
import { provideRouter } from '@angular/router'
import { provideDatadogRouter } from '@datadog/browser-rum-angular/angular-router'
import { AppComponent } from './app/app.component'
import { routes } from './app/routes'

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideDatadogRouter()],
})
```

## Route tracking

Router tracking listens for the `ResolveStart` router event (after guards and redirects, before resolvers execute), and normalizes dynamic segments into parameterized view names:

| Actual URL             | View name                  |
| ---------------------- | -------------------------- |
| `/about`               | `/about`                   |
| `/users/123`           | `/users/:id`               |
| `/users/123/posts/456` | `/users/:id/posts/:postId` |
| `/docs/a/b/c`          | `/docs/a/b/c`              |

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
[3]: https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum
[4]: https://docs.datadoghq.com/logs/log_collection/javascript/
[5]: https://docs.datadoghq.com/real_user_monitoring/generate_metrics
[6]: https://docs.datadoghq.com/help/
