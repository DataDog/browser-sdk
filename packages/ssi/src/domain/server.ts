import * as http from 'node:http'
import * as url from 'node:url'

import { generateResponse } from './responseGenerator.ts'

export function createServer(): http.Server {
  return http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const parsedUrl = url.parse(req.url!, true)

    // Health check
    if (parsedUrl.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('OK')
      return
    }

    // SSI endpoint
    if (parsedUrl.pathname === '/ssi') {
      const configId = parsedUrl.query.id as string

      if (!configId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end('Missing required parameter: id')
        return
      }

      try {
        const jsCode = await generateResponse(configId)

        res.writeHead(200, {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(jsCode)
      } catch (error) {
        console.error('[SSI] Error generating response:', error)
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Internal Server Error')
      }
      return
    }

    if (parsedUrl.pathname?.startsWith('/chunks')) {
      res.writeHead(301, {
        Location: `https://www.datadoghq-browser-agent.com/us1/v6${parsedUrl.pathname}`,
      })
      res.end()
      return
    }

    // 404 for all other routes
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })
}
