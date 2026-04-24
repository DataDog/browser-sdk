import https from 'node:https'
import type http from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import forge from 'node-forge'
import type { BrowserContext, Page } from '@playwright/test'
import { createIntakeProxyMiddleware, IntakeRegistry } from '../../lib/framework'

const SALESFORCE_INTAKE_PROXY_PORT = 9242
const SALESFORCE_INTAKE_PROXY_IDLE_DELAY = 200
const SALESFORCE_INTAKE_PROXY_CLOSE_DELAY = 1_000

export interface ExpectedSalesforceRumView {
  path: string
  loadingType: string
}

export interface SalesforceIntakeProxy {
  origin: string
  intakeRegistry: IntakeRegistry
  waitForViews: (expectedViews: ExpectedSalesforceRumView[], options?: { timeout?: number }) => Promise<void>
  waitForIdle: () => Promise<void>
  stop: () => Promise<void>
}

export async function startSalesforceIntakeProxy(): Promise<SalesforceIntakeProxy> {
  const intakeRegistry = new IntakeRegistry()
  const waiters = new Set<ViewWaiter>()
  const idleWaiter = createIdleWaiter()
  const app = express()

  app.use((_req, res, next) => {
    idleWaiter.trackResponse(res)
    next()
  })
  app.use(allowCrossOriginLoopbackRequests())
  app.post(
    '/',
    createIntakeProxyMiddleware({
      forward: false,
      onRequest: (request) => {
        intakeRegistry.push(request)
        notifyWaiters(waiters, intakeRegistry)
      },
    })
  )

  const server = https.createServer(generateSelfSignedCertificate(), app)
  const origin = await listen(server)

  return {
    origin,
    intakeRegistry,
    waitForViews: (expectedViews, options) => waitForViews(waiters, intakeRegistry, expectedViews, options),
    waitForIdle: () => idleWaiter.wait(),
    stop: () => close(server),
  }
}

function allowCrossOriginLoopbackRequests(): express.RequestHandler {
  return (req, res, next) => {
    const origin = req.header('origin')
    const requestedHeaders = req.header('access-control-request-headers')

    res.header('Access-Control-Allow-Origin', origin || '*')
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.header('Access-Control-Allow-Headers', requestedHeaders || 'content-type')
    res.header('Access-Control-Allow-Private-Network', 'true')
    res.header('Vary', 'Origin, Access-Control-Request-Headers')

    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }

    next()
  }
}

export async function installSalesforceRumProxy(browserContext: BrowserContext, proxyOrigin: string) {
  await browserContext.addInitScript((proxy) => {
    const wrappedFlag = '__ddSalesforceRumProxyWrapped__'

    function isRecord(value: unknown): value is Record<string, unknown> {
      return typeof value === 'object' && value !== null
    }

    function hasRumInit(
      value: unknown
    ): value is Record<string, unknown> & { init: (configuration?: unknown, ...args: unknown[]) => unknown } {
      return isRecord(value) && typeof value.init === 'function'
    }

    function wrapRum(rum: unknown) {
      if (!hasRumInit(rum) || rum[wrappedFlag]) {
        return rum
      }

      const originalInit = rum.init
      Object.defineProperty(rum, wrappedFlag, {
        configurable: true,
        value: true,
      })
      rum.init = function (this: unknown, configuration?: unknown, ...args: unknown[]) {
        return originalInit.call(this, { ...(isRecord(configuration) ? configuration : {}), proxy }, ...args)
      }
      return rum
    }

    let ddRum = wrapRum(window.DD_RUM)

    try {
      Object.defineProperty(window, 'DD_RUM', {
        configurable: true,
        get() {
          return ddRum
        },
        set(value) {
          ddRum = wrapRum(value)
        },
      })
    } catch {
      wrapRum(window.DD_RUM)
    }
  }, proxyOrigin)
}

export async function waitForRumProxyInitialization(page: Page, proxyOrigin: string) {
  await page.waitForFunction(
    (expectedProxy) => window.DD_RUM?.getInitConfiguration?.()?.proxy === expectedProxy,
    proxyOrigin
  )
}

export async function flushSalesforceRumEvents(page: Page) {
  await page.evaluate(() => {
    const beforeUnloadEvent = new Event('beforeunload') as Event & { __ddIsTrusted?: boolean }
    beforeUnloadEvent.__ddIsTrusted = true
    window.dispatchEvent(beforeUnloadEvent)
  })
}

interface ViewWaiter {
  expectedViews: ExpectedSalesforceRumView[]
  timeoutId: NodeJS.Timeout
  resolve: () => void
  reject: (error: Error) => void
}

function waitForViews(
  waiters: Set<ViewWaiter>,
  intakeRegistry: IntakeRegistry,
  expectedViews: ExpectedSalesforceRumView[],
  { timeout = 10_000 } = {}
) {
  return new Promise<void>((resolve, reject) => {
    const waiter: ViewWaiter = {
      expectedViews,
      timeoutId: setTimeout(() => {
        waiters.delete(waiter)
        reject(createTimeoutError(intakeRegistry, expectedViews))
      }, timeout),
      resolve,
      reject,
    }

    waiters.add(waiter)
    notifyWaiters(waiters, intakeRegistry)
  })
}

function notifyWaiters(waiters: Set<ViewWaiter>, intakeRegistry: IntakeRegistry) {
  for (const waiter of waiters) {
    if (findMissingViews(intakeRegistry, waiter.expectedViews).length === 0) {
      clearTimeout(waiter.timeoutId)
      waiters.delete(waiter)
      waiter.resolve()
    }
  }
}

function findMissingViews(intakeRegistry: IntakeRegistry, expectedViews: ExpectedSalesforceRumView[]) {
  return expectedViews.filter(
    ({ path, loadingType }) =>
      !intakeRegistry.rumViewEvents.some(
        (event) => normalizePathname(event.view.url) === normalizePathname(path) && event.view.loading_type === loadingType
      )
  )
}

function createTimeoutError(intakeRegistry: IntakeRegistry, expectedViews: ExpectedSalesforceRumView[]) {
  const expected = expectedViews.map(formatExpectedView).join(', ')
  const captured = intakeRegistry.rumViewEvents.map(formatCapturedView).join(', ') || 'none'

  return new Error(`Timed out waiting for Salesforce RUM views. Expected: ${expected}. Captured: ${captured}.`)
}

function formatExpectedView({ path, loadingType }: ExpectedSalesforceRumView) {
  return `${path} (${loadingType})`
}

function formatCapturedView(event: IntakeRegistry['rumViewEvents'][number]) {
  return `${normalizePathname(event.view.url) || 'unknown'} (${event.view.loading_type || 'unknown'})`
}

function normalizePathname(candidate: unknown) {
  if (typeof candidate !== 'string' || !candidate.trim()) {
    return undefined
  }

  try {
    const pathname = new URL(candidate, 'https://example.org').pathname
    return pathname.endsWith('/') ? pathname.slice(0, -1) || '/' : pathname
  } catch {
    return undefined
  }
}

function listen(server: https.Server) {
  return new Promise<string>((resolve, reject) => {
    server.once('error', reject)
    server.listen(SALESFORCE_INTAKE_PROXY_PORT, () => {
      server.off('error', reject)
      const { port } = server.address() as AddressInfo
      resolve(`https://localhost:${port}`)
    })
  }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      throw new Error(`Salesforce intake proxy port ${SALESFORCE_INTAKE_PROXY_PORT} is already in use.`)
    }
    throw error
  })
}

function close(server: https.Server) {
  return new Promise<void>((resolve, reject) => {
    const forceCloseTimeoutId = setTimeout(() => {
      server.closeAllConnections()
    }, SALESFORCE_INTAKE_PROXY_CLOSE_DELAY)

    server.close((error) => {
      clearTimeout(forceCloseTimeoutId)
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function createIdleWaiter() {
  let pendingCount = 0
  let idlePromise = Promise.resolve()
  let resolveIdlePromise: undefined | (() => void)
  let waitTimeoutId: NodeJS.Timeout | undefined

  function resolveAfterDelay() {
    waitTimeoutId = setTimeout(() => {
      resolveIdlePromise?.()
      resolveIdlePromise = undefined
    }, SALESFORCE_INTAKE_PROXY_IDLE_DELAY)
  }

  return {
    trackResponse(res: http.ServerResponse) {
      clearTimeout(waitTimeoutId)
      if (!resolveIdlePromise) {
        idlePromise = new Promise((resolve) => {
          resolveIdlePromise = resolve
        })
      }

      pendingCount += 1
      res.on('close', () => {
        pendingCount -= 1
        if (pendingCount === 0) {
          resolveAfterDelay()
        }
      })
    },
    wait() {
      return idlePromise
    },
  }
}

function generateSelfSignedCertificate() {
  const pki = forge.pki
  const md = forge.md
  const keys = pki.rsa.generateKeyPair(2048)
  const cert = pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1)

  const attrs = [
    {
      name: 'commonName',
      value: 'localhost',
    },
  ]

  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      keyEncipherment: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
    },
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 2,
          value: 'localhost',
        },
        {
          type: 7,
          ip: '127.0.0.1',
        },
      ],
    },
  ])

  cert.sign(keys.privateKey, md.sha256.create())

  return {
    key: pki.privateKeyToPem(keys.privateKey),
    cert: pki.certificateToPem(cert),
  }
}
