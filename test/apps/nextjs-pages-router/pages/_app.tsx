import type { AppProps } from 'next/app'
import Link from 'next/link'
import { DatadogPagesRouter } from '@datadog/browser-rum-nextjs'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <DatadogPagesRouter />
      <nav style={{ background: '#632ca6', padding: '1rem', marginBottom: '1rem' }}>
        <Link href="/" style={{ color: 'white', textDecoration: 'none' }}>
          Home
        </Link>
      </nav>
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
        <Component {...pageProps} />
      </main>
    </>
  )
}
