import { DatadogAppRouter } from '@datadog/browser-rum-nextjs'

export default function RootLayout({ children, sidebar }: { children: React.ReactNode; sidebar: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <DatadogAppRouter />
        <nav style={{ background: '#632ca6', padding: '1rem', marginBottom: '1rem' }}>
          <a href="/" style={{ color: 'white', textDecoration: 'none' }}>
            Home
          </a>
        </nav>
        <div style={{ display: 'flex', maxWidth: '800px', margin: '0 auto', padding: '1rem' }}>
          <main style={{ flex: 1 }}>{children}</main>
          {sidebar}
        </div>
      </body>
    </html>
  )
}
