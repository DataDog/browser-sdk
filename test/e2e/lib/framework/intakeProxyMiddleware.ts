import { createInflate, inflateSync } from 'node:zlib'
import https from 'node:https'
import type express from 'express'
import createBusboy from 'busboy'
import type { BrowserProfileEvent, BrowserProfilerTrace } from '@datadog/browser-rum/src/types/profiling'
import type { BrowserSegment, BrowserSegmentMetadata } from '@datadog/browser-rum/src/types/sessionReplay'
import type { LogsEvent } from '@datadog/browser-logs/src/logsEvent.types'
import type { RumEvent } from '@datadog/browser-rum-core/src/rumEvent.types'
import type { TelemetryEvent } from '@datadog/browser-core/src/domain/telemetry/telemetryEvent.types'

interface BaseIntakeRequest {
  isBridge: boolean
  encoding: string | null
}

export type LogsIntakeRequest = {
  intakeType: 'logs'
  events: LogsEvent[]
} & BaseIntakeRequest

export type RumIntakeRequest = {
  intakeType: 'rum'
  events: Array<RumEvent | TelemetryEvent>
} & BaseIntakeRequest

export type ReplayIntakeRequest = {
  intakeType: 'replay'
  segment: BrowserSegment
  metadata: BrowserSegmentMetadataAndSegmentSizes
  segmentFile: {
    filename: string
    encoding: string
    mimetype: string
  }
} & BaseIntakeRequest

export type BrowserSegmentMetadataAndSegmentSizes = BrowserSegmentMetadata & {
  raw_segment_size: number
  compressed_segment_size: number
}

export type ProfileIntakeRequest = {
  intakeType: 'profile'
  event: BrowserProfileEvent
  trace: BrowserProfilerTrace
  traceFile: {
    filename: string
    encoding: string | null
    mimetype: string
  }
} & BaseIntakeRequest

export type IntakeRequest = LogsIntakeRequest | RumIntakeRequest | ReplayIntakeRequest | ProfileIntakeRequest

interface IntakeRequestInfos {
  isBridge: boolean
  intakeType: IntakeRequest['intakeType']
  encoding: string | null
}

interface IntakeProxyOptions {
  onRequest?: (request: IntakeRequest) => void
}

export function createIntakeProxyMiddleware(options: IntakeProxyOptions): express.RequestHandler {
  return async (req, res) => {
    const infos = computeIntakeRequestInfos(req)

    try {
      const [intakeRequest] = await Promise.all([
        readIntakeRequest(req, infos),
        !infos.isBridge && forwardIntakeRequestToDatadog(req),
      ])
      options.onRequest?.(intakeRequest)
    } catch (error) {
      console.error('Error while processing request:', error)
    }
    res.end()
  }
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

    const busboy = createBusboy({ headers: req.headers })

    busboy.on('file', (name, stream, info) => {
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

    busboy.on('finish', () => {
      Promise.all([segmentPromise, metadataPromise])
        .then(([{ segment, ...segmentFile }, metadata]) => ({
          ...infos,
          segmentFile,
          metadata,
          segment,
        }))
        .then(resolve, reject)
    })

    req.pipe(busboy)
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

    const busboy = createBusboy({ headers: req.headers })

    busboy.on('file', (name, stream, info) => {
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

    busboy.on('finish', () => {
      Promise.all([eventPromise, tracePromise])
        .then(([event, { trace, ...traceFile }]) => ({
          ...infos,
          event,
          trace,
          traceFile,
        }))
        .then(resolve, reject)
    })

    req.pipe(busboy)
  })
}

function forwardIntakeRequestToDatadog(req: express.Request): Promise<any> {
  return new Promise<void>((resolve) => {
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
    datadogIntakeRequest.on('error', (error) => {
      console.log('Error while forwarding request to Datadog:', error)
      resolve()
    })
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
