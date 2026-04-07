import { defineConfig } from 'vite'
import path from 'path'
import type { Plugin } from 'vite'

function intakeProxy(): Plugin {
  return {
    name: 'intake-proxy',
    configureServer(server) {
      server.middlewares.use('/intake', (req, res) => {
        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', () => {
          const version = req.url?.startsWith('/v6') ? 'v6' : 'v8'
          console.log(`\n📦 [${version}] ${req.method} ${req.url}`)
          if (body) {
            try {
              const events = body
                .split('\n')
                .filter(Boolean)
                .map((line: string) => JSON.parse(line))
              for (const event of events) {
                const msg = event.message ?? JSON.stringify(event).slice(0, 80)
                console.log(`  → [${event.status ?? '?'}] ${event.origin ?? '?'}: ${msg}`)
              }
            } catch {
              console.log(`  → raw: ${body.slice(0, 200)}`)
            }
          }
          res.writeHead(202, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end('{}')
        })
      })
    },
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [intakeProxy()],
  define: {
    __BUILD_ENV__SDK_VERSION__: JSON.stringify('0.0.0-playground'),
    __BUILD_ENV__SDK_SETUP__: JSON.stringify('playground'),
  },
  resolve: {
    alias: {
      // V6 packages
      '@datadog/browser-logs': path.resolve(__dirname, '../../packages/logs/src/entries/main'),
      '@datadog/browser-core': path.resolve(__dirname, '../../packages/core/src'),
      // V8 packages
      '@datadog/core-next': path.resolve(__dirname, '../../packages/core-next/src'),
      '@datadog/browser-core-next': path.resolve(__dirname, '../../packages/browser-core-next/src'),
      '@datadog/browser-sdk': path.resolve(__dirname, '../../packages/browser-sdk/src'),
      '@datadog/browser-logs-next': path.resolve(__dirname, '../../packages/browser-logs-next/src'),
      '@datadog/browser-console-next': path.resolve(__dirname, '../../packages/browser-console-next/src'),
      '@datadog/browser-errors-next': path.resolve(__dirname, '../../packages/browser-errors-next/src'),
      '@datadog/browser-network-next': path.resolve(__dirname, '../../packages/browser-network-next/src'),
    },
  },
  server: {
    port: 8443,
    open: true,
  },
})
