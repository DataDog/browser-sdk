import https from 'https'
import type http from 'http'
import path from 'path'
import type { AddressInfo } from 'net'
import express from 'express'
import forge from 'node-forge'

export type ServerApp = (req: http.IncomingMessage, res: http.ServerResponse) => any

export interface Server {
  origin: string
  stop: () => void
}

// Probe-delivery endpoint hardcoded in `packages/debugger/src/domain/deliveryApi.ts`.
// Must be served from the same origin as the page since the debugger uses same-origin fetch.
const DEBUGGER_PROBE_DELIVERY_PATH = '/api/ui/debugger/probe-delivery'

export function startPerformanceServer(scenarioName: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const app = express()

    // Map scenario names to app directories
    const appMap: Record<string, string> = {
      heavy: '../apps/react-heavy-spa/dist',
      shopistLike: '../apps/react-shopist-like/dist',
      instrumentationOverhead: '../apps/instrumentation-overhead',
    }

    const distPath = path.resolve(import.meta.dirname, appMap[scenarioName])
    app.use(profilingMiddleware)
    app.use(express.json())
    app.post(DEBUGGER_PROBE_DELIVERY_PATH, handleProbeDelivery)
    app.use(express.static(distPath))

    const { key, cert } = generateSelfSignedCertificate()
    const server = https.createServer({ key, cert }, app)

    server.listen(0, '127.0.0.1', () => {
      const origin = `https://localhost:${(server.address() as AddressInfo).port}`
      console.log(`App listening on ${origin}`)

      resolve({ origin, stop: () => server.close() })
    })

    server.on('error', reject)
  })
}

/**
 * Mock the probe-delivery endpoint used by the real debugger SDK.
 *
 * Tests that need active probes (e.g. `instrumented_with_probes`) signal it through the
 * `service` field in the request body, which the SDK populates from
 * `DebuggerInitConfiguration.service`. This avoids per-test mutable server state and makes
 * the response deterministic across parallel benchmark runs.
 */
function handleProbeDelivery(req: express.Request, res: express.Response) {
  const service = (req.body as { service?: string } | undefined)?.service
  res.json({ nextCursor: '', updates: getProbesForService(service), deletions: [] })
}

function getProbesForService(service: string | undefined): object[] {
  if (service === 'instrumented_with_probes') {
    // A typical low-impact LOG_PROBE on the hot-path function, with a low sampling rate so
    // most calls take the fast (sampling-skipped) path. This keeps measurement focused on
    // the per-call overhead of probe lookup + sampling check without flooding the intake.
    return [
      {
        id: 'benchmark-probe-add1',
        version: 1,
        type: 'LOG_PROBE',
        where: { typeName: 'instrumented.ts', methodName: 'add1' },
        template: 'add1 called',
        segments: [{ str: 'add1 called' }],
        captureSnapshot: false,
        capture: {},
        sampling: { snapshotsPerSecond: 1 },
        evaluateAt: 'EXIT',
      },
    ]
  }
  return []
}

function profilingMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.query.profiling) {
    res.setHeader('Document-Policy', 'js-profiling')
  }
  next()
}

function generateSelfSignedCertificate(): { key: string; cert: string } {
  // Simple self-signed certificate for local development
  // In production, you should use proper certificates
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
    {
      name: 'countryName',
      value: 'US',
    },
    {
      shortName: 'ST',
      value: 'Test',
    },
    {
      name: 'localityName',
      value: 'Test',
    },
    {
      name: 'organizationName',
      value: 'Test',
    },
    {
      shortName: 'OU',
      value: 'Test',
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
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
    },
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 2, // DNS
          value: 'localhost',
        },
        {
          type: 7, // IP
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
