import { createInflate } from 'zlib'
import https from 'https'
import connectBusboy from 'connect-busboy'
import express from 'express'

import cors from 'cors'
import type { BrowserSegmentMetadataAndSegmentSizes } from '@datadog/browser-rum/src/domain/segmentCollection'
import type { BrowserSegment } from '@datadog/browser-rum/src/types'
import type { IntakeRegistry, IntakeRequest, ReplayIntakeRequest } from '../intakeRegistry'

interface IntakeRequestInfos {
  isBridge: boolean
  intakeType: IntakeRequest['intakeType']
}

export function createIntakeServerApp(intakeRegistry: IntakeRegistry, bridgeEvents: IntakeRegistry) {
  const app = express()

  app.use(cors())
  app.use(connectBusboy({ immediate: true }))

  app.post('/', (async (req, res) => {
    const infos = computeIntakeRequestInfos(req)
    const events = infos.isBridge ? bridgeEvents : intakeRegistry

    try {
      const [intakeRequest] = await Promise.all([
        readIntakeRequest(req, infos),
        !infos.isBridge && forwardIntakeRequestToDatadog(req),
      ])
      events.push(intakeRequest)
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

  if (req.query.bridge === 'true') {
    const eventType = req.query.event_type
    return {
      isBridge: true,
      intakeType: eventType === 'log' ? 'logs' : 'rum',
    }
  }

  let intakeType: IntakeRequest['intakeType']
  // ddforward = /api/v2/rum?key=value
  const endpoint = ddforward.split(/[/?]/)[3]
  if (endpoint === 'logs' || endpoint === 'rum' || endpoint === 'replay') {
    intakeType = endpoint
  } else {
    throw new Error("Can't find intake type")
  }
  return {
    isBridge: false,
    intakeType,
  }
}

async function readIntakeRequest(req: express.Request, infos: IntakeRequestInfos): Promise<IntakeRequest> {
  if (infos.intakeType === 'replay') {
    return readReplayIntakeRequest(req)
  }

  return {
    intakeType: infos.intakeType,
    isBridge: infos.isBridge,
    events: (await readStream(req))
      .toString('utf-8')
      .split('\n')
      .map((line): any => JSON.parse(line)),
  }
}

function readReplayIntakeRequest(req: express.Request): Promise<ReplayIntakeRequest> {
  return new Promise((resolve, reject) => {
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
        .then(([segmentEntry, metadata]) => ({
          intakeType: 'replay' as const,
          isBridge: false as const,
          metadata,
          ...segmentEntry,
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
      reject(error)
    })
    stream.on('end', () => {
      resolve(Buffer.concat(buffers))
    })
  })
}
