import { createInflate, inflateSync } from 'zlib'
import https from 'https'
import connectBusboy from 'connect-busboy'
import express from 'express'

import cors from 'cors'
import type { BrowserSegmentMetadataAndSegmentSizes } from '@datadog/browser-rum/src/domain/segmentCollection'
import type { BrowserProfileEvent, BrowserProfilerTrace, BrowserSegment } from '@datadog/browser-rum/src/types'
import type {
  IntakeRegistry,
  IntakeRequest,
  LogsIntakeRequest,
  ReplayIntakeRequest,
  RumIntakeRequest,
  ProfileIntakeRequest,
} from '../intakeRegistry'

interface IntakeRequestInfos {
  isBridge: boolean
  intakeType: IntakeRequest['intakeType']
  encoding: string | null
}

export function createIntakeServerApp(intakeRegistry: IntakeRegistry) {
  const app = express()

  app.use(cors())
  app.use(connectBusboy({ immediate: true }))

  app.post('/', (async (req, res) => {
    const infos = computeIntakeRequestInfos(req)

    try {
      const [intakeRequest] = await Promise.all([
        readIntakeRequest(req, infos),
        !infos.isBridge && forwardIntakeRequestToDatadog(req),
      ])
      intakeRegistry.push(intakeRequest)
    } catch (error) {
      console.error('Error while processing request:', error)
    }
    res.end()
  }) as express.RequestHandler)

  return app
}

function computeIntakeRequestInfos(req: express.Request): IntakeRequestInfos {
  const ddforward = req.query.ddforward as string | undefined
  if (!ddforward) {
    throw new Error('ddforward is missing')
  }
  const { pathname, searchParams } = new URL(ddforward, 'https://example.org')

  const encoding = req.headers['content-encoding'] || searchParams.get('dd-evp-encoding')

  if (req.query.bridge === 'true') {
    const eventType = req.query.event_type
    return {
      isBridge: true,
      encoding,
      intakeType: eventType === 'log' ? 'logs' : eventType === 'record' ? 'replay' : 'rum',
    }
  }

  let intakeType: IntakeRequest['intakeType']
  // pathname = /api/v2/rum
  const endpoint = pathname.split(/[/?]/)[3]
  if (endpoint === 'logs' || endpoint === 'rum' || endpoint === 'replay' || endpoint === 'profile') {
    intakeType = endpoint
  } else {
    throw new Error("Can't find intake type")
  }
  return {
    isBridge: false,
    encoding,
    intakeType,
  }
}

function readIntakeRequest(req: express.Request, infos: IntakeRequestInfos): Promise<IntakeRequest> {
  if (infos.intakeType === 'replay') {
    return readReplayIntakeRequest(req, infos as IntakeRequestInfos & { intakeType: 'replay' })
  }
  if (infos.intakeType === 'profile') {
    return readProfileIntakeRequest(req, infos as IntakeRequestInfos & { intakeType: 'profile' })
  }
  return readRumOrLogsIntakeRequest(req, infos as IntakeRequestInfos & { intakeType: 'rum' | 'logs' })
}

async function readRumOrLogsIntakeRequest(
  req: express.Request,
  infos: IntakeRequestInfos & { intakeType: 'rum' | 'logs' }
): Promise<RumIntakeRequest | LogsIntakeRequest> {
  const rawBody = await readStream(req)
  const encodedBody = infos.encoding === 'deflate' ? inflateSync(rawBody) : rawBody

  return {
    ...infos,
    events: encodedBody
      .toString('utf-8')
      .split('\n')
      .map((line): any => JSON.parse(line)),
  }
}

function readReplayIntakeRequest(
  req: express.Request,
  infos: IntakeRequestInfos & { intakeType: 'replay' }
): Promise<ReplayIntakeRequest> {
  return new Promise((resolve, reject) => {
    if (infos.isBridge) {
      readStream(req)
        .then((rawBody) => {
          resolve({
            ...infos,
            segment: {
              records: rawBody
                .toString('utf-8')
                .split('\n')
                .map((line): unknown => JSON.parse(line)),
            },
          } as ReplayIntakeRequest)
        })
        .catch(reject)
      return
    }

    let segmentPromise: Promise<{
      encoding: string
      filename: string
      mimetype: string
      segment: BrowserSegment
    }>
    let metadataPromise: Promise<BrowserSegmentMetadataAndSegmentSizes>

    req.busboy.on('file', (name, stream, info) => {
      const { filename, encoding, mimeType } = info
      if (name === 'segment') {
        segmentPromise = readStream(stream.pipe(createInflate())).then((data) => ({
          encoding,
          filename,
          mimetype: mimeType,
          segment: JSON.parse(data.toString()),
        }))
      } else if (name === 'event') {
        metadataPromise = readStream(stream).then(
          (data) => JSON.parse(data.toString()) as BrowserSegmentMetadataAndSegmentSizes
        )
      }
    })

    req.busboy.on('finish', () => {
      Promise.all([segmentPromise, metadataPromise])
        .then(([{ segment, ...segmentFile }, metadata]) => ({
          ...infos,
          segmentFile,
          metadata,
          segment,
        }))
        .then(resolve, reject)
    })
  })
}

function readProfileIntakeRequest(
  req: express.Request,
  infos: IntakeRequestInfos & { intakeType: 'profile' }
): Promise<ProfileIntakeRequest> {
  return new Promise((resolve, reject) => {
    let eventPromise: Promise<BrowserProfileEvent>
    let tracePromise: Promise<{
      trace: BrowserProfilerTrace
      encoding: string | null
      filename: string
      mimetype: string
    }>

    req.busboy.on('file', (name, stream, info) => {
      const { filename, mimeType } = info
      if (name === 'event') {
        eventPromise = readStream(stream).then((data) => JSON.parse(data.toString()) as BrowserProfileEvent)
      } else if (name === 'wall-time.json') {
        tracePromise = readStream(stream).then((data) => {
          let encoding: string | null
          if (isDeflateEncoded(data)) {
            encoding = 'deflate'
            data = inflateSync(data)
          } else {
            encoding = null
          }
          return {
            trace: JSON.parse(data.toString()) as BrowserProfilerTrace,
            encoding,
            filename,
            mimetype: mimeType,
          }
        })
      } else {
        // Skip other attachments
        stream.resume()
      }
    })

    req.busboy.on('finish', () => {
      Promise.all([eventPromise, tracePromise])
        .then(([event, { trace, ...traceFile }]) => ({
          ...infos,
          event,
          trace,
          traceFile,
        }))
        .then(resolve, reject)
    })
  })
}

function forwardIntakeRequestToDatadog(req: express.Request): Promise<any> {
  return new Promise((resolve, reject) => {
    const ddforward = req.query.ddforward! as string
    if (!/^\/api\/v2\//.test(ddforward)) {
      throw new Error(`Unsupported ddforward: ${ddforward}`)
    }
    const options = {
      method: 'POST',
      headers: {
        'X-Forwarded-For': req.socket.remoteAddress,
        'Content-Type': req.headers['content-type'],
        'User-Agent': req.headers['user-agent'],
      },
    }
    const datadogIntakeRequest = https.request(new URL(ddforward, 'https://browser-intake-datadoghq.com'), options)
    req.pipe(datadogIntakeRequest)
    datadogIntakeRequest.on('response', resolve)
    datadogIntakeRequest.on('error', reject)
  })
}

function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const buffers: Buffer[] = []
    stream.on('data', (data: Buffer) => {
      buffers.push(data)
    })
    stream.on('error', (error) => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(error)
    })
    stream.on('end', () => {
      resolve(Buffer.concat(buffers))
    })
  })
}

function isDeflateEncoded(buffer: Buffer): boolean {
  // Check for deflate/zlib magic numbers
  // 0x78 0x01 - No Compression/low
  // 0x78 0x9C - Default Compression
  // 0x78 0xDA - Best Compression
  return buffer.length >= 2 && buffer[0] === 0x78 && (buffer[1] === 0x01 || buffer[1] === 0x9c || buffer[1] === 0xda)
}
