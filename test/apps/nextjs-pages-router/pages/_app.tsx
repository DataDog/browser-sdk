import type { AppProps } from 'next/app'
import { datadogRum } from '@datadog/browser-rum'
import { nextjsPlugin } from '@datadog/browser-rum-nextjs'
import { DatadogRumProvider } from '@datadog/browser-rum-nextjs/pages-router'

if (typeof window !== 'undefined') {
  const config = (window as any).RUM_CONFIGURATION
  if (config) {
    datadogRum.init({
      ...config,
      plugins: [nextjsPlugin({ router: 'pages' }), ...(config.plugins || [])],
    })
  }
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <DatadogRumProvider>
      <nav style={{ background: '#632ca6', padding: '1rem', marginBottom: '1rem' }}>
        <a href="/" style={{ color: 'white', textDecoration: 'none' }}>
          Home
        </a>
      </nav>
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
        <Component {...pageProps} />
      </main>
    </DatadogRumProvider>
  )
}
