// Custom App wrapper for all pages router tests. Mounts DatadogPagesRouter (for view tracking)
// around every page component. Equivalent of layout.tsx in the app router.
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
