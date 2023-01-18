import { createInflate } from 'zlib'
import https from 'https'
import connectBusboy from 'connect-busboy'
import express from 'express'

import cors from 'cors'
import type { SegmentFile } from '../../types/serverEvents'
import type { EventRegistry, IntakeType } from '../eventsRegistry'

export function createIntakeServerApp(serverEvents: EventRegistry, bridgeEvents: EventRegistry) {
  const app = express()

  app.use(cors())
  app.use(express.text())
  app.use(connectBusboy({ immediate: true }))

  app.post('/', (async (req, res) => {
    const { isBridge, intakeType } = computeIntakeType(req)
    const events = isBridge ? bridgeEvents : serverEvents

    try {
      if (intakeType === 'sessionReplay') {
        await Promise.all([storeReplayData(req, events), forwardReplayToIntake(req)])
      } else {
        storeEventsData(events, intakeType, req.body as string)
        if (!isBridge) {
          await forwardEventsToIntake(req)
        }
      }
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

function storeEventsData(events: EventRegistry, intakeType: 'logs' | 'rum' | 'telemetry', data: string) {
  data.split('\n').map((rawEvent) => {
    const event = JSON.parse(rawEvent)
    if (intakeType === 'rum' && event.type === 'telemetry') {
      events.push('telemetry', event)
    } else {
      events.push(intakeType, event)
    }
  })
}

function forwardEventsToIntake(req: express.Request): Promise<any> {
  return new Promise((resolve, reject) => {
    const intakeRequest = prepareIntakeRequest(req)
    intakeRequest.on('response', resolve)
    intakeRequest.on('error', reject)
    // can't directly pipe the request since
    // the stream has already been read by express body parser
    intakeRequest.write(req.body)
    intakeRequest.end()
  })
}

async function storeReplayData(req: express.Request, events: EventRegistry): Promise<any> {
  return new Promise((resolve, reject) => {
    const metadata: {
      [field: string]: string
    } = {}
    let segmentPromise: Promise<SegmentFile>

    req.busboy.on('file', (name, stream, info) => {
      const { filename, encoding, mimeType } = info
      if (name === 'segment') {
        segmentPromise = readStream(stream.pipe(createInflate())).then((data) => ({
          encoding,
          filename,
          mimetype: mimeType,
          data: JSON.parse(data.toString()),
        }))
      }
    })

    req.busboy.on('field', (key: string, value: string) => {
      metadata[key] = value
    })

    req.busboy.on('finish', () => {
      segmentPromise
        .then((segment) => {
          events.push('sessionReplay', { metadata, segment })
        })
        .then(resolve)
        .catch((e) => reject(e))
    })
  })
}

async function forwardReplayToIntake(req: express.Request): Promise<any> {
  return new Promise((resolve, reject) => {
    const intakeRequest = prepareIntakeRequest(req)
    req.pipe(intakeRequest)
    intakeRequest.on('response', resolve)
    intakeRequest.on('error', reject)
  })
}

function prepareIntakeRequest(req: express.Request) {
  const ddforward = req.query.ddforward! as string
  if (!/^https:\/\/(session-replay|rum|logs)\.browser-intake-datadoghq\.com\//.test(ddforward)) {
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
  return https.request(ddforward, options)
}

async function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
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
