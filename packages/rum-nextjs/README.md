# RUM Browser Monitoring - NEXTJS integration

This package provides NextJS integration for Datadog Browser RUM, supporting both the App Router and Pages Router.

Requires Next.js v15.3+, which supports the [`instrumentation-client`][1] file convention.

[1]: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client

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
