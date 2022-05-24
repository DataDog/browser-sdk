import { createInflate } from 'zlib'
import connectBusboy from 'connect-busboy'
import express from 'express'

import cors from 'cors'
import type { SegmentFile, SessionReplayCall } from '../../types/serverEvents'
import type { EventRegistry, IntakeType } from '../eventsRegistry'

export function createIntakeServerApp(serverEvents: EventRegistry, bridgeEvents: EventRegistry) {
  const app = express()

  app.use(cors())
  app.use(express.text())
  app.use(connectBusboy({ immediate: true }))

  app.post('/', (req, res) => {
    const { isBridge, intakeType } = computeIntakeType(req)
    const events = isBridge ? bridgeEvents : serverEvents

    if (intakeType === 'sessionReplay') {
      readSessionReplay(req).then(
        (sessionReplayCall) => {
          events.push('sessionReplay', sessionReplayCall)
        },
        (error) => {
          console.error(`Error while reading session replay response: ${String(error)}`)
        }
      )
    } else {
      ;(req.body as string).split('\n').map((rawEvent) => {
        const event = JSON.parse(rawEvent)
        if (intakeType === 'rum' && event.type === 'telemetry') {
          events.push('telemetry', event)
        } else {
          events.push(intakeType, event)
        }
      })
    }

    res.end()
  })

  return app
}

function computeIntakeType(req: express.Request): { isBridge: boolean; intakeType: IntakeType } {
  const ddforward = req.query.ddforward as string | undefined
  if (!ddforward) {
    throw new Error('ddforward is missing')
  }

  if (ddforward === 'bridge') {
    const eventType = req.query.event_type
    return {
      isBridge: true,
      intakeType: eventType === 'log' ? 'logs' : 'rum',
    }
  }

  let intakeType: IntakeType
  const forwardUrl = new URL(ddforward)
  const endpoint = forwardUrl.pathname.split('/').pop()
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

async function readSessionReplay(req: express.Request): Promise<SessionReplayCall> {
  return new Promise((resolve, reject) => {
    const metadata: {
      [field: string]: string
    } = {}
    let segmentPromise: Promise<SegmentFile>

    req.busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      if (fieldname === 'segment') {
        segmentPromise = readStream(file.pipe(createInflate())).then((data) => ({
          encoding,
          filename,
          mimetype,
          data: JSON.parse(data.toString()),
        }))
      }
    })

    req.busboy.on('field', (key: string, value: string) => {
      metadata[key] = value
    })

    req.busboy.on('finish', () => {
      segmentPromise.then((segment) => resolve({ metadata, segment })).catch((e) => reject(e))
    })
  })
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
