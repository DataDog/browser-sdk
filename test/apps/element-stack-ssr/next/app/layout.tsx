import type { ReactNode } from 'react'
import Script from 'next/script'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script src="/prototype-sdk.js" strategy="beforeInteractive" />
        <Script src="/prototype-runtime.js" strategy="beforeInteractive" />
        {children}
        <h2>Click events (beforeSend)</h2>
        <pre id="events">Click a button to inspect its attribution.</pre>
      </body>
    </html>
  )
}
