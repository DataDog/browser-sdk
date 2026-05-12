// WebSocket translation proxy that lets a recent @playwright/test client (1.58) drive an
// older `playwright run-server` (1.40). Two layers of translation:
//
// 1) HTTP upgrade — the 1.40 server's User-Agent version check rejects mismatched clients
//    with HTTP 428. We rewrite the upgrade request's User-Agent so the check passes.
//
// 2) JSON-RPC — once connected, the 1.58 client validates server messages strictly and
//    sends commands using the 1.58 schema. We patch __create__ initializers (server→client)
//    and command parameters (client→server) where the schemas diverge between versions.
//
// Patches were derived from a diff of packages/protocol/src/protocol.yml between v1.40.1
// and v1.58.2 — only the divergences exercised by this repo's e2e tests are translated.
//
// Usage: node pinnedProxy.ts --listen 5400 --upstream 127.0.0.1:5401

import http from 'node:http'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { WebSocketServer, WebSocket, type RawData } from 'ws'

interface JsonRpcMessage {
  method?: string
  guid?: string
  params?: Record<string, unknown> & {
    type?: string
    guid?: string
    initializer?: Record<string, unknown>
  }
}

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, arr): [string, string] | null => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null))
    .filter((entry): entry is [string, string] => entry !== null)
)

const LISTEN = Number(args.listen || 5400)
const UPSTREAM = args.upstream || '127.0.0.1:5401'
const SPOOF_UA = args['spoof-ua'] || 'Playwright/1.40.1 (arm64; macos 14.5) node/22.0.0'
const TRACE = process.env.PINNED_PROXY_TRACE === '1'

const httpServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('pinnedProxy')
})

const wss = new WebSocketServer({ noServer: true })

httpServer.on('upgrade', (req, socket, head) => {
  req.headers['user-agent'] = SPOOF_UA

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    const upstreamUrl = `ws://${UPSTREAM}${req.url || '/'}`
    const upstreamWs = new WebSocket(upstreamUrl, {
      headers: {
        'user-agent': SPOOF_UA,
        ...forwardHeader(req.headers, 'x-playwright-browser'),
        ...forwardHeader(req.headers, 'x-playwright-launch-options'),
        ...forwardHeader(req.headers, 'x-playwright-proxy'),
      },
    })

    // guid -> channel type, populated from server __create__ messages so we know how to
    // translate client commands like `Frame.waitForTimeout` based on the target object.
    const guidTypes = new Map<string, string>()
    let queueToUpstream: string[] = []

    upstreamWs.on('open', () => {
      for (const msg of queueToUpstream) {
        upstreamWs.send(msg)
      }
      queueToUpstream = []
    })

    clientWs.on('message', (data: RawData) => {
      const text = rawDataToString(data)
      if (TRACE) {
        console.log('C->S', text.slice(0, 500))
      }
      const rewritten = rewriteClientToServer(text, guidTypes)
      if (rewritten === null) {
        return
      }
      if (upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(rewritten)
      } else {
        queueToUpstream.push(rewritten)
      }
    })

    upstreamWs.on('message', (data: RawData) => {
      const text = rawDataToString(data)
      if (TRACE) {
        console.log('S->C', text.slice(0, 800))
      }
      const rewritten = rewriteServerToClient(text, guidTypes)
      if (rewritten === null) {
        return
      }
      clientWs.send(rewritten)
    })

    const closeBoth = () => {
      try {
        clientWs.close()
      } catch {
        // ignore close errors
      }
      try {
        upstreamWs.close()
      } catch {
        // ignore close errors
      }
    }
    clientWs.on('close', closeBoth)
    upstreamWs.on('close', closeBoth)
    clientWs.on('error', closeBoth)
    upstreamWs.on('error', (err) => {
      console.error('[pinnedProxy] upstream error:', err.message)
      closeBoth()
    })
  })
})

httpServer.listen(LISTEN, '127.0.0.1', () => {
  console.log(`[pinnedProxy] listening on ws://127.0.0.1:${LISTEN}/ -> ws://${UPSTREAM}/`)
})

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString('utf8')
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8')
  }
  return Buffer.from(data).toString('utf8')
}

function forwardHeader(headers: http.IncomingHttpHeaders, name: string): Record<string, string> {
  const value = headers[name]
  return typeof value === 'string' ? { [name]: value } : {}
}

// Server (1.40) -> Client (1.58)
function rewriteServerToClient(text: string, guidTypes: Map<string, string>): string | null {
  let msg: JsonRpcMessage
  try {
    msg = JSON.parse(text) as JsonRpcMessage
  } catch {
    return text
  }
  if (msg.method === '__create__' && msg.params) {
    const type = msg.params.type
    if (msg.params.guid && type) {
      guidTypes.set(msg.params.guid, type)
    }
    const init = msg.params.initializer || {}
    // Selectors channel was removed; drop the __create__ and strip references from Playwright.
    if (type === 'Selectors') {
      return null
    }
    if (type === 'Playwright') {
      delete init.selectors
    }
    // BrowserContextInitializer requires `options` in 1.58 (sub-fields all optional).
    if (type === 'BrowserContext' && init.options === undefined) {
      init.options = {}
    }
    // RequestInitializer requires `hasResponse` in 1.58.
    if (type === 'Request' && init.hasResponse === undefined) {
      init.hasResponse = false
    }
    msg.params.initializer = init
  }
  return JSON.stringify(msg)
}

// Client (1.58) -> Server (1.40)
function rewriteClientToServer(text: string, guidTypes: Map<string, string>): string | null {
  let msg: JsonRpcMessage
  try {
    msg = JSON.parse(text) as JsonRpcMessage
  } catch {
    return text
  }
  if (typeof msg.method !== 'string') {
    return text
  }
  const type = msg.guid ? guidTypes.get(msg.guid) : undefined
  const params = msg.params || {}

  // Frame.waitForTimeout: param renamed `timeout` -> `waitTimeout` in 1.58.
  if (type === 'Frame' && msg.method === 'waitForTimeout') {
    if (params.waitTimeout !== undefined && params.timeout === undefined) {
      params.timeout = params.waitTimeout
      delete params.waitTimeout
    }
  }

  // 1.40 required `noWaitAfter` on these mutation methods; 1.58 dropped it.
  // Inject a default so the server's required-param validator is satisfied.
  const noWaitAfterMethods: Record<string, Set<string>> = {
    Frame: new Set([
      'check',
      'dblclick',
      'dragAndDrop',
      'fill',
      'hover',
      'selectOption',
      'setInputFiles',
      'tap',
      'type',
      'uncheck',
    ]),
    ElementHandle: new Set([
      'check',
      'dblclick',
      'fill',
      'hover',
      'selectOption',
      'setInputFiles',
      'tap',
      'type',
      'uncheck',
    ]),
  }
  if (type && noWaitAfterMethods[type]?.has(msg.method) && params.noWaitAfter === undefined) {
    params.noWaitAfter = false
  }

  msg.params = params
  return JSON.stringify(msg)
}
