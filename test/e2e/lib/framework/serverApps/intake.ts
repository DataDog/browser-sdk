import { createInflate } from 'zlib'
import connectBusboy from 'connect-busboy'
import express from 'express'

import { SegmentFile, SerssionReplayCall } from '../../types/serverEvents'
import { EventRegistry } from '../eventsRegistry'

export function createIntakeServerApp(events: EventRegistry) {
  const app = express()

  app.use(express.text())
  app.use(connectBusboy({ immediate: true }))

  app.post('/v1/input/:endpoint', async (req, res) => {
    const endpoint = req.params.endpoint
    if (endpoint === 'rum' || endpoint === 'logs' || endpoint === 'internalMonitoring') {
      ;(req.body as string).split('\n').map((rawEvent) => events.push(endpoint, JSON.parse(rawEvent)))
    }

    if (endpoint === 'sessionReplay' && req.busboy) {
      events.push('sessionReplay', await readSessionReplay(req))
    }

    res.end()
  })

  return app
}

async function readSessionReplay(req: express.Request): Promise<SerssionReplayCall> {
  return new Promise((resolve, reject) => {
    const meta: {
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
      meta[key] = value
    })

    req.busboy.on('finish', () => {
      segmentPromise.then((segment) => resolve({ meta, segment })).catch((e) => reject(e))
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
