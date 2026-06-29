// WebSocket translation proxy that lets a recent @playwright/test client (1.61) drive an
// older `playwright run-server` (1.40). Two layers of translation:
//
// 1) HTTP upgrade — the 1.40 server's User-Agent version check rejects mismatched clients
//    with HTTP 428. We rewrite the upgrade request's User-Agent so the check passes.
//
// 2) JSON-RPC — once connected, the recent client validates server messages strictly and
//    sends commands using the recent schema. We patch __create__ initializers (server→client)
//    and command parameters (client→server) where the schemas diverge between versions.
//
// Patches were derived from a diff of the JSON-RPC protocol schema in packages/protocol/src
// (`protocol.yml` up to v1.59.1, `channels.d.ts` from v1.60.0 onward — `protocol.yml` was
// removed in 1.60) between v1.40.1 and v1.61.0 — only the divergences exercised by this
// repo's e2e tests are translated.
//
// Usage: node pinnedProxy.ts --listen 5400 --upstream 127.0.0.1:5401

import http from 'node:http'
import process from 'node:process'
import { WebSocketServer, WebSocket, type RawData } from 'ws'

import { rawDataToString } from '../lib/helpers/rawDataToString.ts'

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
    // Request guid -> URL, used to inject requestUrl into Route.fulfill for 1.40 compat.
    const requestUrls = new Map<string, string>()
    // Route guid -> Request guid, to look up the URL when Route.fulfill is called.
    const routeRequestGuids = new Map<string, string>()
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
      const rewritten = rewriteClientToServer(text, guidTypes, routeRequestGuids, requestUrls)
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
      const rewritten = rewriteServerToClient(text, guidTypes, requestUrls, routeRequestGuids)
      if (rewritten === null) {
        return
      }
      for (const out of rewritten) {
        clientWs.send(out)
      }
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

function forwardHeader(headers: http.IncomingHttpHeaders, name: string): Record<string, string> {
  const value = headers[name]
  return typeof value === 'string' ? { [name]: value } : {}
}

// Server (1.40) -> Client (1.60). Returns one or more messages to forward to the client, or
// null to drop the upstream message. Returning multiple messages allows synthesising channels
// that newer client schemas require but the older server doesn't emit (e.g. Debugger).
function rewriteServerToClient(
  text: string,
  guidTypes: Map<string, string>,
  requestUrls: Map<string, string>,
  routeRequestGuids: Map<string, string>
): string[] | null {
  let msg: JsonRpcMessage
  try {
    msg = JSON.parse(text) as JsonRpcMessage
  } catch {
    return [text]
  }
  // BrowserContextConsoleEvent requires `timestamp` (tFloat, ms since epoch) in 1.59. The 1.40
  // server emits `console` without that field — inject a best-effort wall time.
  if (
    msg.method === 'console' &&
    msg.params &&
    msg.params.timestamp === undefined &&
    msg.guid !== undefined &&
    guidTypes.get(msg.guid) === 'BrowserContext'
  ) {
    msg.params.timestamp = Date.now()
    return [JSON.stringify(msg)]
  }
  // BrowserContextPageErrorEvent gained a required `location` ({ url, line, column }) in 1.60
  // (backing the new `webError.location()` API). The 1.40 server emits `pageError` without it,
  // so the 1.60 client's strict validator drops the event and uncaught exceptions / unhandled
  // rejections / runtime errors never surface. Inject a best-effort stub so the event is
  // delivered — our tests assert on the error captured by the SDK, not on the wire location.
  if (
    msg.method === 'pageError' &&
    msg.params &&
    msg.params.location === undefined &&
    msg.guid !== undefined &&
    guidTypes.get(msg.guid) === 'BrowserContext'
  ) {
    msg.params.location = { url: '', line: 0, column: 0 }
    return [JSON.stringify(msg)]
  }
  if (msg.method === '__create__' && msg.params) {
    const type = msg.params.type
    if (msg.params.guid && type) {
      guidTypes.set(msg.params.guid, type)
    }
    const init = msg.params.initializer || {}
    // Track Request URL so Route.fulfill can inject requestUrl for 1.40 compat.
    if (type === 'Request' && msg.params.guid && typeof init.url === 'string') {
      requestUrls.set(msg.params.guid, init.url)
    }
    // Track Route -> Request guid association.
    if (
      type === 'Route' &&
      msg.params.guid &&
      init.request &&
      typeof (init.request as { guid?: string }).guid === 'string'
    ) {
      routeRequestGuids.set(msg.params.guid, (init.request as { guid: string }).guid)
    }
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
    // BrowserInitializer requires `browserName` in 1.59. In 1.40 the `name` field already
    // held the browser type ("chromium" | "firefox" | "webkit"), so copy it over.
    if (type === 'Browser' && init.browserName === undefined && typeof init.name === 'string') {
      init.browserName = init.name
    }
    // BrowserContextInitializer requires a `debugger` Debugger channel in 1.59. The 1.40 server
    // has no Debugger channel, so synthesise one (parented to the same Browser as the context)
    // and inject the reference. DebuggerInitializer is `{}` in 1.59, so an empty initializer is
    // valid. The client only uses BrowserContext.debugger when debug controller features are
    // requested, which our tests don't do.
    if (type === 'BrowserContext' && init.debugger === undefined && msg.params.guid) {
      const debuggerGuid = `debugger@synthetic-${msg.params.guid}`
      guidTypes.set(debuggerGuid, 'Debugger')
      const debuggerCreate = {
        guid: msg.guid,
        method: '__create__',
        params: { type: 'Debugger', initializer: {}, guid: debuggerGuid },
      }
      init.debugger = { guid: debuggerGuid }
      msg.params.initializer = init
      return [JSON.stringify(debuggerCreate), JSON.stringify(msg)]
    }
    msg.params.initializer = init
  }
  return [JSON.stringify(msg)]
}

// Client (1.60) -> Server (1.40)
function rewriteClientToServer(
  text: string,
  guidTypes: Map<string, string>,
  routeRequestGuids: Map<string, string>,
  requestUrls: Map<string, string>
): string | null {
  let msg: JsonRpcMessage
  try {
    msg = JSON.parse(text) as JsonRpcMessage
  } catch {
    return text
  }
  if (typeof msg.method !== 'string') {
    return text
  }

  // __waitInfo__ is a fire-and-forget instrumentation message added in 1.61 (replacing the
  // old EventTargetChannel.waitForEventInfo pattern). The client never registers a callback
  // for it, so if the 1.40 server receives it and sends back an error response, the client
  // throws "Cannot find command to respond: <id>". Drop it instead of forwarding.
  if (msg.method === '__waitInfo__') {
    return null
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

  // Route.fulfill: 1.40 required `requestUrl: string` (used for CORS header injection);
  // 1.58 dropped it. Inject the URL of the intercepted request to satisfy the validator.
  if (type === 'Route' && msg.method === 'fulfill' && params.requestUrl === undefined) {
    const reqGuid = msg.guid ? routeRequestGuids.get(msg.guid) : undefined
    params.requestUrl = (reqGuid ? requestUrls.get(reqGuid) : undefined) ?? ''
  }

  msg.params = params
  return JSON.stringify(msg)
}
