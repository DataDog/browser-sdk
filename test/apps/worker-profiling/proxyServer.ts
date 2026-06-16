/**
 * Proxy server for the worker-profiling test app (port 8082).
 *
 * Run in a separate terminal: `yarn proxy`
 *
 * Provides:
 * - `POST /proxy?ddforward=...` — intake proxy (no forwarding to Datadog)
 * - `GET /events` — SSE stream of parsed profile summaries
 * - `GET /datadog-worker.js` — deflate worker bundle (built from source)
 */
import path from 'node:path'
import zlib from 'node:zlib'
import http from 'node:http'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import webpack from 'webpack'
// @ts-ignore — no types for webpack-dev-middleware default export in ESM
import webpackDevMiddleware from 'webpack-dev-middleware'
import busboy from 'busboy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 8082

// ---------------------------------------------------------------------------
// SSE broadcast
// ---------------------------------------------------------------------------
const sseClients = new Set<express.Response>()

function broadcast(data: object): void {
  const line = `data: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    client.write(line)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (d: Buffer) => chunks.push(d))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

function isDeflate(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x78 && (buf[1] === 0x01 || buf[1] === 0x9c || buf[1] === 0xda)
}

function intakeType(req: express.Request): 'rum' | 'logs' | 'profile' | 'replay' | 'unknown' {
  const ddforward = req.query.ddforward as string | undefined
  if (!ddforward) {
    return 'unknown'
  }
  const { pathname } = new URL(ddforward, 'https://example.org')
  const endpoint = pathname.split('/')[3]
  if (endpoint === 'rum' || endpoint === 'logs' || endpoint === 'profile' || endpoint === 'replay') {
    return endpoint
  }
  return 'unknown'
}

function tagValue(tags: string[], key: string): string | undefined {
  const match = tags.find((t) => t.startsWith(`${key}:`))
  return match ? match.slice(key.length + 1) : undefined
}

// ---------------------------------------------------------------------------
// Profile parser + summariser
// ---------------------------------------------------------------------------
function handleProfile(req: express.Request): Promise<void> {
  return new Promise((resolve) => {
    let eventPromise: Promise<any>
    let tracePromise: Promise<any>

    const bb = busboy({ headers: req.headers })

    bb.on('file', (name: string, stream: NodeJS.ReadableStream) => {
      if (name === 'event') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        eventPromise = readStream(stream).then((d) => JSON.parse(d.toString()))
      } else if (name === 'wall-time.json') {
        tracePromise = readStream(stream).then((d) => {
          const buf = isDeflate(d) ? zlib.inflateSync(d) : d
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return JSON.parse(buf.toString())
        })
      } else {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        ;(stream as any).resume()
      }
    })

    bb.on('finish', () => {
      void Promise.all([eventPromise, tracePromise])
        .then(([event, trace]) => broadcast(summariseProfile(event, trace)))
        .catch((e) => console.error('[proxy] profile parse error:', e))
        .finally(resolve)
    })

    bb.on('error', (e: Error) => {
      console.error('[proxy] busboy error:', e)
      resolve()
    })

    req.pipe(bb)
  })
}

async function handleRum(req: express.Request): Promise<void> {
  const encoding = req.headers['content-encoding']
  const raw = await readStream(req)
  const body = encoding === 'deflate' ? zlib.inflateSync(raw) : raw
  const events = body
    .toString('utf-8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return JSON.parse(l)
      } catch {
        return null
      }
    })
    .filter(Boolean)
  broadcast({ type: 'rum', eventCount: events.length })
}

function summariseProfile(event: any, trace: any): object {
  const tags: string[] = ((event.tags_profiler ?? '') as string).split(',').filter(Boolean)
  const durationMs = new Date(event.end).getTime() - new Date(event.start).getTime()

  const { samples = [], stacks = [], frames = [], resources = [] } = trace
  const counts = new Map<number, number>()
  for (const sample of samples) {
    let id: number | undefined = sample.stackId
    while (id !== undefined) {
      const stack = stacks[id]
      counts.set(stack.frameId, (counts.get(stack.frameId) ?? 0) + 1)
      id = stack.parentId
    }
  }
  const topFrames = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([frameId, count]) => {
      const frame = frames[frameId]
      return {
        name: frame.name || '(anonymous)',
        resource: frame.resourceId !== undefined ? resources[frame.resourceId] : undefined,
        line: frame.line,
        count,
      }
    })

  return {
    type: 'profile',
    tags,
    startTime: event.start,
    endTime: event.end,
    durationMs,
    sampleCount: (samples as any[]).length,
    frameCount: (frames as any[]).length,
    topFrames,
    sessionId: tagValue(tags, 'session_id') ?? event.session?.id,
  }
}

// ---------------------------------------------------------------------------
// Deflate worker bundle (built from source, served at /datadog-worker.js)
// ---------------------------------------------------------------------------
const tsconfigPath = path.resolve(__dirname, 'tsconfig.json')

const deflateWorkerCompiler = webpack({
  mode: 'development',
  entry: path.resolve(__dirname, '../../../packages/browser-worker/src/entries/main.ts'),
  target: ['web', 'es2020'],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: { configFile: tsconfigPath, onlyCompileBundledFiles: true, transpileOnly: true },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    // Reuse the monorepo tsconfig path aliases
    alias: {
      '@datadog/browser-core': path.resolve(__dirname, '../../../packages/browser-core/src'),
      '@datadog/js-core/time': path.resolve(__dirname, '../../../packages/js-core/src/time.ts'),
      '@datadog/browser-rum-core': path.resolve(__dirname, '../../../packages/browser-rum-core/src'),
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      __BUILD_ENV__SDK_VERSION__: JSON.stringify('dev'),
      __BUILD_ENV__SDK_SETUP__: JSON.stringify('npm'),
      __BUILD_ENV__WORKER_STRING__: JSON.stringify(''),
    }),
  ],
  output: { filename: 'datadog-worker.js', globalObject: 'self' },
})

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express()
app.use(cors())

// Deflate worker bundle
// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.use(webpackDevMiddleware(deflateWorkerCompiler, { stats: 'minimal' }))

// SSE
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

// Intake proxy
// eslint-disable-next-line @typescript-eslint/no-misused-promises
app.post('/proxy', async (req, res) => {
  const type = intakeType(req)
  if (type === 'profile') {
    await handleProfile(req)
  } else if (type === 'rum') {
    await handleRum(req)
  }
  res.end()
})

http.createServer(app).listen(PORT, () => {
  console.log('\n🔬 Worker Profiling proxy')
  console.log(`   Intake:  POST http://localhost:${PORT}/proxy`)
  console.log(`   SSE:     GET  http://localhost:${PORT}/events`)
  console.log(`   Worker:  GET  http://localhost:${PORT}/datadog-worker.js\n`)
})
