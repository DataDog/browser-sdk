# @datadog/browser-rum-nextjs

Client-side Real User Monitoring (RUM) integration for Next.js. Provides automatic view tracking, RSC fetch labeling, error collection, and source map upload configuration.

For **server-side APM tracing** (Server Actions, error handling, trace correlation), use [`dd-trace/next`](https://github.com/DataDog/dd-trace-js/tree/master/packages/datadog-plugin-next).

Requires **Next.js v15.3+** (supports the [`instrumentation-client`][1] file convention).

[1]: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client

## App Router Usage

### 1. Create `instrumentation-client.js`

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

### 2. Add `DatadogAppRouter` to your root layout

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

## Pages Router Usage

### 1. Create `instrumentation-client.js`

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

### 2. Add `DatadogPagesRouter` to your custom App

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

## Features

### Automatic View Tracking

`DatadogAppRouter` and `DatadogPagesRouter` automatically track route changes as RUM views. View names use the route pattern (e.g., `/user/[id]`) rather than the resolved URL.

### RSC Fetch Labeling

The plugin automatically detects and labels React Server Component fetches in RUM resource events via `event.context.nextjs`:

| `requestType` | Meaning |
|---|---|
| `rsc-navigation` | Client-side navigation RSC fetch |
| `rsc-prefetch` | Link prefetch RSC fetch |
| `server-action` | Server Action POST request |

For Server Action fetches, the `actionId` (Next.js hash) is also captured. These attributes are queryable in the RUM Explorer:

```
@type:resource @context.nextjs.requestType:server-action
@type:resource @context.nextjs.requestType:rsc-navigation
```

### Error Collection

Use `addNextjsError` to report errors to RUM with Next.js context:

```ts
import { addNextjsError } from '@datadog/browser-rum-nextjs'
```

### Source Map Upload

Use `withDatadogRum` in `next.config.js` to configure source map upload and Datadog environment variables:

```js
// next.config.js
const { withDatadogRum } = require('@datadog/browser-rum-nextjs/config')

module.exports = withDatadogRum({
  // your next config
})
```

## API Reference

### Exports from `@datadog/browser-rum-nextjs`

| Export | Description |
|---|---|
| `nextjsPlugin()` | RUM plugin — pass to `datadogRum.init({ plugins: [...] })` |
| `onRouterTransitionStart` | Re-export from `instrumentation-client.js` for App Router view tracking |
| `DatadogAppRouter` | React component for App Router view tracking |
| `DatadogPagesRouter` | React component for Pages Router view tracking |
| `addNextjsError` | Report errors to RUM |

### Exports from `@datadog/browser-rum-nextjs/config`

| Export | Description |
|---|---|
| `withDatadogRum(nextConfig)` | Wraps Next.js config for source map upload and env vars |
