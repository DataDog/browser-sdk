import type https from 'https'
import path from 'path'
import express from 'express'
import forge from 'node-forge'
import { createServer } from '../lib/httpServers'
import type { Server, ServerApp } from '../lib/httpServers'

let serversSingleton: undefined | Server<ServerApp>

export async function startPerformanceServer(): Promise<Server<ServerApp>> {
  if (serversSingleton) {
    return serversSingleton
  }

  const app = express()
  const distPath = path.resolve(__dirname, '../apps/react-heavy-spa/dist')
  // Add Document-Policy header when ?profiling query param is present
  app.use((req, res, next) => {
    if (req.query.profiling) {
      res.setHeader('Document-Policy', 'js-profiling')
    }
    next()
  })

  app.use(express.static(distPath))

  const { key, cert } = generateSelfSignedCertificate()

  const httpsOptions: https.ServerOptions = {
    key,
    cert,
  }

  serversSingleton = await createServer(httpsOptions)
  serversSingleton.bindServerApp(app)

  return serversSingleton
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
