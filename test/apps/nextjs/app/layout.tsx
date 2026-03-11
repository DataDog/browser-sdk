// Root layout for all app router tests. Mounts DatadogAppRouter (for view tracking) and the
// @sidebar parallel route slot. Loaded as the outer shell by every app router test.
import { DatadogAppRouter } from '@datadog/browser-rum-nextjs'

export default function RootLayout({ children, sidebar }: { children: React.ReactNode; sidebar: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <DatadogAppRouter />
        <div style={{ display: 'flex' }}>
          <main>{children}</main>
          {sidebar}
        </div>
      </body>
    </html>
  )
}
