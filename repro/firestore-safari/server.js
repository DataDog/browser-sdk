// Repro server for https://github.com/DataDog/browser-sdk/issues/4524
//
// Usage:
//   node repro/firestore-safari/server.js          # SDK loaded from the public CDN
//   node repro/firestore-safari/server.js --local  # SDK loaded from packages/rum/bundle (run `yarn build` first)
//
// Then open http://localhost:3000 in real Safari (macOS or iOS) and use the buttons.
// Open Web Inspector → Console to watch for "due to access control checks" messages.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')

const HOST_PORT = 3000
const CROSS_PORT = 3001
const useLocalSdk = process.argv.includes('--local')

const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8')
const sdkScriptTag = useLocalSdk
  ? '<script src="/datadog-rum.js"></script>'
  : '<script src="https://www.datadoghq-browser-agent.com/us1/v6/datadog-rum.js"></script>'

const renderedHtml = indexHtml
  .replaceAll('__CROSS_ORIGIN__', `http://localhost:${CROSS_PORT}`)
  .replace('__SDK_SCRIPT__', sdkScriptTag)

// Origin A — serves the host page.
http
  .createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(renderedHtml)
      return
    }
    if (useLocalSdk && req.url === '/datadog-rum.js') {
      const bundlePath = path.join(REPO_ROOT, 'packages', 'rum', 'bundle', 'datadog-rum.js')
      if (!fs.existsSync(bundlePath)) {
        res.writeHead(500).end(`Local bundle not found at ${bundlePath} — run \`yarn build\` first.`)
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' })
      fs.createReadStream(bundlePath).pipe(res)
      return
    }
    res.writeHead(404).end('not found')
  })
  .listen(HOST_PORT, () => {
    console.log(`Host page:           http://localhost:${HOST_PORT}`)
  })

// Origin B — streams chunks like Firestore WebChannel's read channel.
http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.setHeader('Access-Control-Expose-Headers', '*')

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    if (req.url && req.url.startsWith('/streaming-xhr')) {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      })
      let i = 0
      const timer = setInterval(() => {
        i += 1
        res.write(`[[${i},["chunk-${i}-${'x'.repeat(80)}"]]\n`)
        if (i >= 5) {
          clearInterval(timer)
          res.end()
        }
      }, 200)
      req.on('close', () => clearInterval(timer))
      return
    }

    res.writeHead(404).end('not found')
  })
  .listen(CROSS_PORT, () => {
    console.log(`Cross-origin server: http://localhost:${CROSS_PORT}`)
    console.log('')
    console.log(
      `SDK source:          ${useLocalSdk ? 'local build (packages/rum/bundle/datadog-rum.js)' : 'public CDN (us1 v6)'}`
    )
    console.log('')
    console.log('Open http://localhost:3000 in Safari, open Web Inspector, click the buttons.')
    console.log('Press Ctrl+C to stop.')
  })
