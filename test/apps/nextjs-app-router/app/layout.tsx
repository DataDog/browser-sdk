import type { Metadata } from 'next'
import { RumProvider } from './providers'

export const metadata: Metadata = {
  title: 'Next.js App Router Test',
  description: 'Test app for Datadog RUM Next.js integration',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <RumProvider>
          <nav style={{ background: '#632ca6', padding: '1rem', marginBottom: '1rem' }}>
            <a href="/" style={{ color: 'white', textDecoration: 'none' }}>
              Home
            </a>
          </nav>
          <main style={{ maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>{children}</main>
        </RumProvider>
      </body>
    </html>
  )
}
