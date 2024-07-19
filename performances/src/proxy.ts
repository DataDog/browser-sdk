import { URL } from 'url'
import type { IncomingMessage, ServerResponse } from 'http'
import { createServer } from 'https'
import type { AddressInfo } from 'net'
import { pki, md } from 'node-forge'
import type { RequestStatsForHost } from './profiling.types'

export interface Proxy {
  origin: string
  spkiFingerprint: string
  stop: () => void
  stats: ProxyStats
}

interface ProxyStats {
  addRequest: (request: IncomingMessage, size: number) => void
  getStatsByHost: () => RequestStatsForHost[]
  reset: () => void
}

function proxyStatsFactory(): ProxyStats {
  const statsByHost = new Map<string, { requestsSize: number; requestsCount: number }>()

  function addRequest(request: IncomingMessage, size: number) {
    const url = new URL(request.url!, 'http://foo')
    const intakeUrl = new URL(url.searchParams.get('ddforward')!)

    let hostStats = statsByHost.get(intakeUrl.hostname)
    if (!hostStats) {
      hostStats = { requestsSize: 0, requestsCount: 0 }
      statsByHost.set(intakeUrl.hostname, hostStats)
    }

    hostStats.requestsCount += 1
    hostStats.requestsSize += size
  }

  function getStatsByHost(): RequestStatsForHost[] {
    return Array.from(statsByHost, ([host, { requestsSize, requestsCount }]) => ({
      host,
      requestsSize,
      requestsCount,
    }))
  }

  function reset() {
    statsByHost.clear()
  }

  return { addRequest, getStatsByHost, reset }
}

export function startProxy() {
  return new Promise<Proxy>((resolve, reject) => {
    const { key, cert, spkiFingerprint } = createSelfSignedCertificate()
    const stats = proxyStatsFactory()
    const server = createServer({ key, cert })
    server.on('error', reject)
    server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      let requestSize = 0
      req.on('data', (data) => {
        requestSize += data.byteLength
      })
      req.on('end', () => {
        stats.addRequest(req, requestSize)
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin!)
        res.writeHead(200)
        res.end('{}')
      })
    })
    server.on('listening', () => {
      resolve({
        origin: `https://localhost:${(server.address() as AddressInfo).port}`,
        spkiFingerprint,
        stop: () => server.close(),
        stats,
      })
    })
    server.listen(0, '127.0.0.1')
  })
}

function createSelfSignedCertificate() {
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
      value: 'Illinois',
    },
    {
      name: 'localityName',
      value: 'Downers Grove',
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
      codeSigning: true,
      emailProtection: true,
      timeStamping: true,
    },
    {
      name: 'nsCertType',
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true,
    },
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 6, // URI
          value: 'localhost',
        },
        {
          type: 7, // IP
          ip: '127.0.0.1',
        },
      ],
    },
    {
      name: 'subjectKeyIdentifier',
    },
  ])
  cert.sign(keys.privateKey)

  const spkiHex = pki.getPublicKeyFingerprint(cert.publicKey, {
    encoding: 'hex',
    md: md.sha256.create(),
    type: 'SubjectPublicKeyInfo',
  })

  return {
    key: pki.privateKeyToPem(keys.privateKey),
    cert: pki.certificateToPem(cert),
    spkiFingerprint: Buffer.from(spkiHex, 'hex').toString('base64'),
  }
}
