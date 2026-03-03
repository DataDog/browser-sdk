# RUM Browser Monitoring - NEXTJS integration

This package provides NextJS App Router integration for Datadog Browser RUM.

Requires Next.js v15.3+, which supports the [`instrumentation-client`][1] file convention.

[1]: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client

# Usage

## 1. Create an `instrumentation-client.js` file in the root of your Next.js project

Initialize the Datadog RUM SDK with the `nextjsPlugin`:

```js
import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-next-plugin'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [nextjsPlugin({ router: 'app' })],
})
```

## 2. Wrap your root layout with the provider

```tsx
// app/layout.tsx
import { DatadogRumProvider } from '@datadog/browser-rum-next-plugin'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DatadogRumProvider>{children}</DatadogRumProvider>
      </body>
    </html>
  )
}
```
