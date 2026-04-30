import { defineConfig } from 'vite'
import path from 'path'
import type { Plugin } from 'vite'

function intakeProxy(): Plugin {
  return {
    name: 'intake-proxy',
    configureServer(server) {
      // Handle CORS preflight
      server.middlewares.use('/intake', (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          })
          res.end()
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', () => {
          const version = req.url?.startsWith('/v6') ? 'v6' : 'v8'
          const track = req.url?.includes('/rum') ? 'rum' : req.url?.includes('/logs') ? 'logs' : 'other'
          console.log(`\n📦 [${version}] [${track}] ${req.method} ${req.url?.slice(0, 80)}`)
          if (body) {
            try {
              const events = body
                .split('\n')
                .filter(Boolean)
                .map((line: string) => JSON.parse(line))
              for (const event of events) {
                // RUM events have a type field (view, action, error, resource, long_task)
                const rumType = event.type ?? event.view?.loading_type
                const msg = event.message ?? rumType ?? JSON.stringify(event).slice(0, 80)
                const viewId = event.view?.id?.slice(0, 8) ?? ''
                const extra = viewId ? ` [view:${viewId}]` : ''
                console.log(`  → [${event.status ?? rumType ?? '?'}]${extra} ${msg}`)
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
      '@datadog/browser-rum-core': path.resolve(__dirname, '../../packages/rum-core/src'),
      '@datadog/browser-rum': path.resolve(__dirname, '../../packages/rum/src/entries/main'),
      // V8 packages
      '@datadog/core-next': path.resolve(__dirname, '../../packages/core-next/src'),
      '@datadog/browser-sdk': path.resolve(__dirname, '../../packages/browser-sdk/src'),
      '@datadog/browser-logs-next': path.resolve(__dirname, '../../packages/browser-logs-next/src'),
      '@datadog/browser-rum-next/processor': path.resolve(__dirname, '../../packages/browser-rum-next/src/processor'),
      '@datadog/browser-rum-next': path.resolve(__dirname, '../../packages/browser-rum-next/src'),
    },
  },
  server: {
    port: 8443,
    open: true,
  },
})
