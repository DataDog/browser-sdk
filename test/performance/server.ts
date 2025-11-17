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

export function startPerformanceServer(scenarioName: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const app = express()

    // Map scenario names to app directories
    const appMap: Record<string, string> = {
      heavy: '../apps/react-heavy-spa/dist',
      shopistLike: '../apps/react-shopist-like/dist',
    }

    const distPath = path.resolve(import.meta.dirname, appMap[scenarioName])
    app.use(profilingMiddleware)
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
