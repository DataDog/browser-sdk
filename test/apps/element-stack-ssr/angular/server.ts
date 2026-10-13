import '@angular/compiler'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { bootstrapApplication, provideClientHydration } from '@angular/platform-browser'
import { renderApplication, provideServerRendering } from '@angular/platform-server'
import { App } from './app'

const document = `<!doctype html><html lang="en"><head><base href="/">
<script src="/prototype-sdk.js"></script><script src="/prototype-runtime.js"></script></head>
<body><app-root></app-root><h2>Click events (beforeSend)</h2><pre id="events">Click a button to inspect its attribution.</pre>
<script type="module" src="/client.js"></script></body></html>`

createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url || '/', 'http://localhost:3103').pathname
    if (['/prototype-sdk.js', '/prototype-runtime.js', '/client.js'].includes(pathname)) {
      const directory = pathname === '/client.js' ? './' : '../public/'
      response.setHeader('Content-Type', 'text/javascript')
      response.end(await readFile(new URL(directory + pathname.slice(1), import.meta.url)))
      return
    }
    if (pathname !== '/') {
      response.writeHead(404).end()
      return
    }
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          App,
          {
            providers: [provideServerRendering(), provideClientHydration()],
          },
          context
        ),
      { document, url: 'http://localhost:3103/', allowedHosts: ['localhost'] }
    )
    response.setHeader('Content-Type', 'text/html')
    response.end(html)
  } catch (error) {
    console.error(error)
    response.writeHead(500).end(String(error))
  }
}).listen(3103, '127.0.0.1', () => console.log('Angular SSR: http://127.0.0.1:3103'))
