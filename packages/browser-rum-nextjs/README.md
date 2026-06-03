# RUM Browser Monitoring - NEXTJS integration

**Note**: This integration is in Preview. Features and configuration are subject to change.

## Overview

The Datadog RUM Next.js integration provides framework-specific instrumentation to help you monitor and debug Next.js applications. This integration adds:

- **Automatic route change detection** for both the App Router and Pages Router
- **View name normalization** that converts dynamic route segments into parameterized names (e.g. `/users/123` becomes `/users/[id]`)
- **Error reporting** with built-in components for Next.js error boundaries
- **Full-stack visibility** by correlating frontend performance with backend traces and logs

Combined with Datadog RUM's core capabilities, you can debug performance bottlenecks, track user journeys, monitor Core Web Vitals, and analyze every user session with context.

## Setup

Start by setting up [Datadog RUM][1] in your Next.js application:

- If you are creating a RUM application, select **Next.js** as the application type.
- If Next.js is not available as an option, select **React** and follow the steps below to integrate the plugin manually.

After configuration, the Datadog App provides instructions for integrating the [RUM-Next.js plugin][2] with the Browser SDK.

Both routers require **Next.js v15.3+**, which supports the [`instrumentation-client`][3] file convention.

## App router usage

### 1. Create an `instrumentation-client.js` file in the root of your Next.js project

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

### 2. Call the DatadogAppRouter component from your root layout.

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

### 3. Report errors from error boundaries

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

## Pages router usage

### 1. Create an `instrumentation-client.js` file in the root of your Next.js project

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

### 2. Call the DatadogPagesRouter component from your custom App.

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

### 3. Report errors from error boundaries

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

## Route tracking

The `DatadogPagesRouter` and `DatadogAppRouter` components automatically track route changes and normalize dynamic segments into parameterized view names:

| Actual URL             | View name                        |
| ---------------------- | -------------------------------- |
| `/about`               | `/about`                         |
| `/users/123`           | `/users/[id]`                    |
| `/users/123/posts/456` | `/users/[userId]/posts/[postId]` |
| `/docs/a/b/c`          | `/docs/[...slug]`                |

## Go further with Datadog Next.js integration

### Traces

Connect your RUM and trace data to get a complete view of your application's performance. See [Connect RUM and Traces][4].

### Logs

To forward your Next.js application's logs to Datadog, see [JavaScript Logs Collection][5].

### Metrics

To generate custom metrics from your RUM application, see [Generate Metrics][6].

## Troubleshooting

Need help? Contact [Datadog Support][7].

[1]: https://docs.datadoghq.com/real_user_monitoring/browser/setup/client
[2]: https://www.npmjs.com/package/@datadog/browser-rum-nextjs
[3]: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client
[4]: https://docs.datadoghq.com/real_user_monitoring/platform/connect_rum_and_traces/?tab=browserrum
[5]: https://docs.datadoghq.com/logs/log_collection/javascript/
[6]: https://docs.datadoghq.com/real_user_monitoring/generate_metrics
[7]: https://docs.datadoghq.com/help/
