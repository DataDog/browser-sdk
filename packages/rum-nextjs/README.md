# RUM Browser Monitoring - NEXTJS integration

This package provides NextJS App Router integration for Datadog Browser RUM.

Requires Next.js v15.3+, which supports the [`instrumentation-client`][1] file convention.

[1]: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client

# Usage

## 1. Create an `instrumentation-client.js` file in the root of your Next.js project

Initialize the Datadog RUM SDK with the `nextjsPlugin`:

```js
import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-nextjs'

datadogRum.init({
  applicationId: '<APP_ID>',
  clientToken: '<CLIENT_TOKEN>',
  site: 'datadoghq.com',
  plugins: [nextjsPlugin({ router: 'app' })],
})
```

## 2. Create a client-side providers component

Next.js components marked with `'use client'` are still [partially rendered on the server][2].
To ensure `DatadogRumProvider` runs exclusively on the client, wrap it in
an [intermediary client component][3]:

```tsx
// app/providers.tsx
'use client'

import { DatadogRumProvider } from '@datadog/browser-rum-nextjs'

export function Providers({ children }: { children: React.ReactNode }) {
  return <DatadogRumProvider>{children}</DatadogRumProvider>
}
```

## 3. Wrap your root layout with the provider

Import the client-side `Providers` component into your root layout (which remains a Server Component):

```tsx
// app/layout.tsx
import { Providers } from './providers'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

[2]: https://nextjs.org/docs/app/getting-started/server-and-client-components
[3]: https://nextjs.org/docs/app/getting-started/server-and-client-components#third-party-components
