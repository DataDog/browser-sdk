import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const sdk = new URL('../../../packages/browser-rum/bundle/datadog-rum.js', import.meta.url)
for (const [name, port] of [
  ['shell', 3110],
  ['reactMfe', 3111],
  ['vueMfe', 3112],
  ['angularMfe', 3113],
]) {
  createServer(async (request, response) => {
    const pathname = new URL(request.url || '/', `http://127.0.0.1:${port}`).pathname
    try {
      let file
      if (name === 'shell' && pathname === '/') file = path.join(directory, 'index.html')
      else if (name === 'shell' && pathname === '/style.css') file = path.join(directory, 'style.css')
      else if (name === 'shell' && pathname === '/prototype-sdk.js') file = sdk
      else {
        const root = path.join(directory, 'dist', name)
        file = path.resolve(root, '.' + decodeURIComponent(pathname))
        if (!file.startsWith(root + path.sep)) {
          response.writeHead(403).end()
          return
        }
      }
      const body = await readFile(file)
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader(
        'Content-Type',
        pathname.endsWith('.js')
          ? 'text/javascript'
          : pathname.endsWith('.css')
            ? 'text/css'
            : pathname.endsWith('.json')
              ? 'application/json'
              : pathname === '/'
                ? 'text/html'
                : 'application/octet-stream'
      )
      response.end(body)
    } catch (error) {
      if (error.code === 'ENOENT') response.writeHead(404).end('Not found')
      else {
        console.error(error)
        response.writeHead(500).end('Unable to load resource')
      }
    }
  }).listen(port, '127.0.0.1', () => console.log(`${name}: http://127.0.0.1:${port}`))
}
