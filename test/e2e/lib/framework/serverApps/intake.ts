import { createInflate } from 'zlib'
import https from 'https'
import connectBusboy from 'connect-busboy'
import express from 'express'

import cors from 'cors'
import type { BrowserSegmentMetadataAndSegmentSizes } from '@datadog/browser-rum/src/domain/segmentCollection'
import type { SegmentFile } from '../../types/serverEvents'
import type { IntakeRegistry, IntakeType } from '../intakeRegistry'

export function createIntakeServerApp(intakeRegistry: IntakeRegistry, bridgeEvents: IntakeRegistry) {
  const app = express()

  app.use(cors())
  app.use(connectBusboy({ immediate: true }))

  app.post('/', (async (req, res) => {
    const { isBridge, intakeType } = computeIntakeType(req)
    const events = isBridge ? bridgeEvents : intakeRegistry

    try {
      await Promise.all([
        intakeType === 'sessionReplay' ? storeReplayData(req, events) : storeEventsData(req, events, intakeType),
        !isBridge && forwardIntakeRequestToDatadog(req),
      ])
    } catch (error) {
      console.error(`Error while processing request: ${String(error)}`)
    }
    res.end()
  }) as express.RequestHandler)

  return app
}

function computeIntakeType(
  req: express.Request
): { isBridge: true; intakeType: 'logs' | 'rum' } | { isBridge: false; intakeType: IntakeType } {
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

  let intakeType: IntakeType
  // ddforward = /api/v2/rum?key=value
  const endpoint = ddforward.split(/[/?]/)[3]
  if (endpoint === 'logs' || endpoint === 'rum') {
    intakeType = endpoint
  } else if (endpoint === 'replay' && req.busboy) {
    intakeType = 'sessionReplay'
  } else {
    throw new Error("Can't find intake type")
  }
  return {
    isBridge: false,
    intakeType,
  }
}

async function storeEventsData(req: express.Request, events: IntakeRegistry, intakeType: 'logs' | 'rum' | 'telemetry') {
  const data = await readStream(req)
  data
    .toString('utf-8')
    .split('\n')
    .map((rawEvent) => {
      const event = JSON.parse(rawEvent)
      if (intakeType === 'rum' && event.type === 'telemetry') {
        events.push('telemetry', event)
      } else {
        events.push(intakeType, event)
      }
    })
}

function storeReplayData(req: express.Request, events: IntakeRegistry): Promise<any> {
  return new Promise((resolve, reject) => {
    let segmentPromise: Promise<SegmentFile>
    let metadataPromise: Promise<BrowserSegmentMetadataAndSegmentSizes>

    req.busboy.on('file', (name, stream, info) => {
      const { filename, encoding, mimeType } = info
      if (name === 'segment') {
        segmentPromise = readStream(stream.pipe(createInflate())).then((data) => ({
          encoding,
          filename,
          mimetype: mimeType,
          data: JSON.parse(data.toString()),
        }))
      } else if (name === 'event') {
        metadataPromise = readStream(stream).then(
          (data) => JSON.parse(data.toString()) as BrowserSegmentMetadataAndSegmentSizes
        )
      }
    })

    req.busboy.on('finish', () => {
      Promise.all([segmentPromise, metadataPromise])
        .then(([segment, metadata]) => {
          events.push('sessionReplay', { metadata, segment })
        })
        .then(resolve)
        .catch((e) => reject(e))
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
