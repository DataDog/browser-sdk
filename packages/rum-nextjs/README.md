# RUM Browser Monitoring - NEXTJS integration

This package provides NextJS App Router integration for Datadog Browser RUM.

Requires Next.js v15.3+, which supports the [`instrumentation-client`][1] file convention.

[1]: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation-client

# Usage

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

For **Server Component** errors, Next.js sends a generic message to the client and attaches `error.digest` — a hash that links the client-side error to your server-side logs. For **Client Component** errors, `error.message` is the original message and `digest` is absent.

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

For errors in the **root layout**, use `global-error.tsx` — it must provide its own `<html>` and `<body>` tags since the root layout is replaced:

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

You can also pass custom context:

```ts
addNextjsError(error, { route: '/dashboard', userId: '123' })
```
