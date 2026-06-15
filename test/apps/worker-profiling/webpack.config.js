// @ts-check
const path = require('node:path')
const zlib = require('node:zlib')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')
const busboy = require('busboy')

const tsconfigPath = path.resolve(__dirname, 'tsconfig.json')

// ---------------------------------------------------------------------------
// SSE broadcast — shared across all webpack-dev-server requests
// ---------------------------------------------------------------------------
/** @type {Set<import('express').Response>} */
const sseClients = new Set()

/** @param {object} data */
function broadcast(data) {
  const line = `data: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    client.write(line)
  }
}

// ---------------------------------------------------------------------------
// Intake proxy helpers (CJS port of intakeProxyMiddleware.ts)
// ---------------------------------------------------------------------------
/**
 * @param {Buffer} buf
 * @returns {boolean}
 */
function isDeflate(buf) {
  return buf.length >= 2 && buf[0] === 0x78 && (buf[1] === 0x01 || buf[1] === 0x9c || buf[1] === 0xda)
}

/**
 * @param {NodeJS.ReadableStream} stream
 * @returns {Promise<Buffer>}
 */
function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (d) => chunks.push(d))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

/**
 * Parse the ?ddforward= URL to determine intake type.
 * @param {import('express').Request} req
 * @returns {'rum'|'logs'|'profile'|'replay'|'unknown'}
 */
function intakeType(req) {
  const ddforward = /** @type {string} */ (req.query.ddforward)
  if (!ddforward) return 'unknown'
  const { pathname } = new URL(ddforward, 'https://example.org')
  const endpoint = pathname.split('/')[3]
  if (endpoint === 'rum') return 'rum'
  if (endpoint === 'logs') return 'logs'
  if (endpoint === 'profile') return 'profile'
  if (endpoint === 'replay') return 'replay'
  return 'unknown'
}

/**
 * Parse a profile multipart request and broadcast a summary via SSE.
 * @param {import('express').Request} req
 */
function handleProfile(req) {
  return new Promise((resolve) => {
    /** @type {Promise<object>} */ let eventPromise
    /** @type {Promise<object>} */ let tracePromise

    const bb = busboy({ headers: req.headers })

    bb.on('file', (name, stream, info) => {
      if (name === 'event') {
        eventPromise = readStream(stream).then((d) => JSON.parse(d.toString()))
      } else if (name === 'wall-time.json') {
        tracePromise = readStream(stream).then((d) => {
          const buf = isDeflate(d) ? zlib.inflateSync(d) : d
          return JSON.parse(buf.toString())
        })
      } else {
        stream.resume()
      }
    })

    bb.on('finish', () => {
      Promise.all([eventPromise, tracePromise])
        .then(([event, trace]) => {
          broadcast(summariseProfile(event, trace))
        })
        .catch((e) => console.error('[proxy] profile parse error:', e))
        .finally(resolve)
    })

    bb.on('error', (e) => {
      console.error('[proxy] busboy error:', e)
      resolve(undefined)
    })

    req.pipe(bb)
  })
}

/**
 * @param {import('express').Request} req
 */
async function handleRum(req) {
  const encoding = req.headers['content-encoding']
  const raw = await readStream(req)
  const body = encoding === 'deflate' ? zlib.inflateSync(raw) : raw
  const events = body.toString('utf-8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)
  broadcast({ type: 'rum', eventCount: events.length })
}

// ---------------------------------------------------------------------------
// Profile summariser
// ---------------------------------------------------------------------------
/** @param {string} tags @param {string} key @returns {string|undefined} */
function extractTag(tags, key) {
  const match = tags.split(',').find((t) => t.startsWith(`${key}:`))
  return match ? match.slice(key.length + 1) : undefined
}

/** @param {string} tags @param {string} key @returns {string[]} */
function extractAllTags(tags, key) {
  return tags.split(',').filter((t) => t.startsWith(`${key}:`)).map((t) => t.slice(key.length + 1))
}

/** @param {object} event @param {object} trace */
function summariseProfile(event, trace) {
  const tags = event.tags_profiler ?? ''
  const thread = tags.includes('thread:worker') ? 'worker' : 'main'
  const durationMs = new Date(event.end).getTime() - new Date(event.start).getTime()

  const { samples = [], stacks = [], frames = [], resources = [] } = trace
  const counts = new Map()
  for (const sample of samples) {
    let id = sample.stackId
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
    thread,
    workerName: extractTag(tags, 'worker.name'),
    correlationIds: extractAllTags(tags, 'thread.correlation_id'),
    startTime: event.start,
    endTime: event.end,
    durationMs,
    sampleCount: samples.length,
    frameCount: frames.length,
    topFrames,
    sessionId: event.session?.id,
  }
}

// ---------------------------------------------------------------------------
// Webpack config
// ---------------------------------------------------------------------------
/** @type {import('webpack').Configuration} */
module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',

  entry: {
    main: './src/main.ts',
    worker: './src/profilingWorker.ts',
  },

  target: ['web', 'es2020'],

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [{ loader: 'ts-loader', options: { configFile: tsconfigPath, onlyCompileBundledFiles: true } }],
        exclude: /node_modules/,
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [new TsconfigPathsPlugin({ configFile: tsconfigPath })],
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    globalObject: 'self',
  },

  plugins: [
    new webpack.DefinePlugin({
      __BUILD_ENV__SDK_VERSION__: JSON.stringify('dev'),
      __BUILD_ENV__SDK_SETUP__: JSON.stringify('npm'),
      __BUILD_ENV__WORKER_STRING__: JSON.stringify(''),
    }),

    new HtmlWebpackPlugin({
      template: './src/index.html',
      chunks: ['main'],
      filename: 'index.html',
    }),
  ],

  devServer: {
    port: 8081,
    headers: { 'Document-Policy': 'js-profiling' },

    setupMiddlewares(middlewares, devServer) {
      const app = devServer.app

      // SSE endpoint — browser subscribes here for live profile events
      app.get('/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.flushHeaders()
        sseClients.add(res)
        req.on('close', () => sseClients.delete(res))
      })

      // Intake proxy — SDK posts here instead of Datadog
      app.post('/proxy', (req, res) => {
        const type = intakeType(req)
        const done = () => res.end()
        if (type === 'profile') {
          handleProfile(req).then(done)
        } else if (type === 'rum') {
          handleRum(req).then(done)
        } else {
          res.end()
        }
      })

      return middlewares
    },
  },

  optimization: { splitChunks: false, runtimeChunk: false },
}
