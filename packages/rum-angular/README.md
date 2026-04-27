# RUM Browser Monitoring - Angular integration

> **Note**: This integration is in beta. Features and configuration may change.

## Overview

With the Datadog RUM Angular integration, resolve performance issues quickly in Angular applications by:

- Debugging the root cause of performance bottlenecks, such as a slow server response time, render-blocking resource, or an error inside a component
- Automatically correlating web performance data with user journeys, HTTP calls, and logs
- Alerting your engineering teams when crucial web performance metrics (such as Core Web Vitals) fall below a threshold that results in a poor user experience

Monitor your Angular applications from end-to-end by:

- Tracking and visualizing user journeys across your entire stack
- Debugging the root cause of slow load times, which may be an issue with your Angular code, network performance, or underlying infrastructure
- Analyzing and contextualizing every user session with attributes such as user ID, email, name, and more
- Unifying full-stack monitoring in one platform for frontend and backend development teams

## Setup

Start by setting up [Datadog RUM][1] in your Angular application. If you're creating a new RUM application in the Datadog App, select Angular as the application type. If you already have an existing RUM application, you can update its type to Angular instead. Once configured, the Datadog App will provide instructions for integrating the [RUM-Angular plugin][2] with the Browser SDK. If Angular is not available as an option, follow the steps below to integrate the plugin manually.

## Usage

### 1. Initialize the Datadog RUM SDK with the Angular plugin

```typescript
import { datadogRum } from '@datadog/browser-rum'
import { angularPlugin } from '@datadog/browser-rum-angular'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [angularPlugin()],
})
```

## Error Tracking

To track errors that occur inside Angular components, you can either use the built-in provider or report errors manually from your own error handler.

### `provideDatadogErrorHandler` usage

`provideDatadogErrorHandler()` replaces Angular's default `ErrorHandler` with one that reports errors to Datadog RUM. It preserves the default `console.error` behavior.

**Standalone setup:**

```typescript
import { bootstrapApplication } from '@angular/platform-browser'
import { angularPlugin, provideDatadogErrorHandler } from '@datadog/browser-rum-angular'
import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  ...
  plugins: [angularPlugin()],
})

bootstrapApplication(AppComponent, {
  providers: [provideDatadogErrorHandler()],
})
```

**NgModule setup:**

```typescript
import { angularPlugin, provideDatadogErrorHandler } from '@datadog/browser-rum-angular'
import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  ...
  plugins: [angularPlugin()],
})

@NgModule({
  providers: [provideDatadogErrorHandler()],
})
export class AppModule {}
```

### Reporting Angular errors from your own `ErrorHandler`

If you already have a custom `ErrorHandler`, use `addAngularError` to report errors to Datadog without replacing your handler:

```typescript
import { ErrorHandler } from '@angular/core'
import { addAngularError } from '@datadog/browser-rum-angular'

class MyCustomErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    addAngularError(error)
    // ... custom logic (show toast, log to service, etc.)
  }
}
```

## Angular Router Integration

To track route changes with Angular's built-in router, initialize the `angularPlugin` with the `router: true` option and add `provideDatadogRouter()` to your providers.

**Standalone setup:**

```typescript
import { bootstrapApplication } from '@angular/platform-browser'
import { provideRouter } from '@angular/router'
import { angularPlugin, provideDatadogRouter } from '@datadog/browser-rum-angular'
import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  ...
  plugins: [angularPlugin({ router: true })],
})

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes), provideDatadogRouter()],
})
```

**NgModule setup:**

```typescript
import { angularPlugin, provideDatadogRouter } from '@datadog/browser-rum-angular'
import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  ...
  plugins: [angularPlugin({ router: true })],
})

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  providers: [provideDatadogRouter()],
})
export class AppModule {}
```

When enabled, the integration uses route patterns as view names instead of resolved URLs. For example, navigating to `/article/2` generates a view named `/article/:articleId` instead.

## Go Further with Datadog Angular Integration

### Traces

Connect your RUM and trace data to get a complete view of your application's performance. See [Connect RUM and Traces][3].

### Logs

To start forwarding your Angular application's logs to Datadog, see [JavaScript Log Collection][4].

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
