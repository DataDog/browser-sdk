# RUM Browser Monitoring - NEXTJS integration

> **Note**: This integration is in beta. Features and configuration may change.

## Overview

With the Datadog RUM Next.js integration, resolve performance issues quickly in Next.js applications by:

- Debugging the root cause of performance bottlenecks, such as a slow server response time, render-blocking resource, or an error inside a component
- Automatically correlating web performance data with user journeys, HTTP calls, and logs
- Alerting your engineering teams when crucial web performance metrics (such as Core Web Vitals) fall below a threshold that results in a poor user experience

Monitor your Next.js applications from end-to-end by:

- Tracking and visualizing user journeys across your entire stack with automatic route change detection for both the App Router and Pages Router
- Automatically normalizing dynamic route segments into parameterized view names (e.g. `/users/123` to `/users/[id]`)
- Analyzing and contextualizing every user session with attributes such as user ID, email, name, and more
- Unifying full-stack monitoring in one platform for frontend and backend development teams

## Setup

Start by setting up [Datadog RUM][2] in your Next.js application. If you're creating a new RUM application in the Datadog App, select Next.js as the application type. If you already have an existing RUM application, you can update its type to Next.js instead. Once configured, the Datadog App will provide instructions for integrating the [RUM-Next.js plugin][8] with the Browser SDK. If Next.js is not available as an option, select React and follow the steps below to integrate the plugin manually.

Both routers require **Next.js v15.3+**, which supports the [`instrumentation-client`][1] file convention.

# App Router Usage

## 1. Create an `instrumentation-client.js` file in the root of your Next.js project

Initialize the Datadog RUM SDK with the `nextjsPlugin` and re-export `onRouterTransitionStart` so Next.js can call it on client-side navigations:

```js
import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin, onRouterTransitionStart } from '@datadog/browser-rum-nextjs'

export { onRouterTransitionStart }

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [nextjsPlugin()],
})
```

## 2. Call the DatadogAppRouter component from your root layout.

```tsx
// app/layout.tsx
import { DatadogAppRouter } from '@datadog/browser-rum-nextjs'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DatadogAppRouter />
        {children}
      </body>
    </html>
  )
}
```

## 3. Report errors from error boundaries

Next.js uses [error boundaries](https://nextjs.org/docs/app/api-reference/file-conventions/error) (`error.tsx` files) to catch uncaught exceptions in each route segment. Use `addNextjsError` inside these boundaries to report errors to Datadog RUM.

For **Server Component** errors, Next.js sends a generic message to the client and attaches `error.digest`, a hash that links the client-side error to your server-side logs. For **Client Component** errors, `error.message` is the original message and `digest` is absent.

```tsx
// app/error.tsx (or app/dashboard/error.tsx, etc.)
'use client'

import { useEffect } from 'react'
import { addNextjsError } from '@datadog/browser-rum-nextjs'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    addNextjsError(error)
  }, [error])

  return <button onClick={reset}>Try again</button>
}
```

For errors in the **root layout**, use `global-error.tsx`; it must provide its own `<html>` and `<body>` tags since the root layout is replaced:

```tsx
// app/global-error.tsx
'use client'

import { useEffect } from 'react'
import { addNextjsError } from '@datadog/browser-rum-nextjs'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    addNextjsError(error)
  }, [error])

  return (
    <html>
      <body>
        <button onClick={reset}>Try again</button>
      </body>
    </html>
  )
}
```

# Pages Router Usage

## 1. Create an `instrumentation-client.js` file in the root of your Next.js project

Initialize the Datadog RUM SDK with the `nextjsPlugin`. The `onRouterTransitionStart` export is **not needed** for Pages Router.

```js
import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-nextjs'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [nextjsPlugin()],
})
```

## 2. Call the DatadogPagesRouter component from your custom App.

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app'
import { DatadogPagesRouter } from '@datadog/browser-rum-nextjs'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <DatadogPagesRouter />
      <Component {...pageProps} />
    </>
  )
}
```

## 3. Report errors from error boundaries

Use the `ErrorBoundary` component in your custom App to catch React rendering errors and report them to Datadog RUM:

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app'
import { DatadogPagesRouter, ErrorBoundary } from '@datadog/browser-rum-nextjs'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <DatadogPagesRouter />
      <ErrorBoundary
        fallback={({ resetError }) => (
          <div>
            <p>Something went wrong</p>
            <button onClick={resetError}>Try again</button>
          </div>
        )}
      >
        <Component {...pageProps} />
      </ErrorBoundary>
    </>
  )
}
```

## Route Tracking

The `DatadogPagesRouter` and `DatadogAppRouter` components automatically track route changes and normalize dynamic segments into parameterized view names:

| Actual URL             | View name                        |
| ---------------------- | -------------------------------- |
| `/about`               | `/about`                         |
| `/users/123`           | `/users/[id]`                    |
| `/users/123/posts/456` | `/users/[userId]/posts/[postId]` |
| `/docs/a/b/c`          | `/docs/[...slug]`                |

## Go Further with Datadog Next.js Integration

### Traces

Connect your RUM and trace data to get a complete view of your application's performance. See [Connect RUM and Traces][3].

### Logs

To start forwarding your Next.js application's logs to Datadog, see [JavaScript Logs Collection][4].

### Metrics

To generate custom metrics from your RUM application, see [Generate Metrics][5].

## Troubleshooting

Need help? Contact [Datadog Support][6].

## Further Reading

Additional helpful documentation, links, and articles:

- [Next.js Monitoring][7]

[1]: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
[2]: https://docs.datadoghq.com/real_user_monitoring/browser/setup/client
[3]: https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum
[4]: https://docs.datadoghq.com/logs/log_collection/javascript/
[5]: https://docs.datadoghq.com/real_user_monitoring/generate_metrics
[6]: https://docs.datadoghq.com/help/
[7]: https://docs.datadoghq.com/real_user_monitoring/browser/monitoring_page_performance/
[8]: https://www.npmjs.com/package/@datadog/browser-rum-nextjs
