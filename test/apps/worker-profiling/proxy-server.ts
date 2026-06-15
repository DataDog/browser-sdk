/**
 * Proxy server for the worker-profiling test app.
 *
 * Run alongside the webpack-dev-server (yarn dev):
 *   node proxy-server.ts          (requires Node 26 via volta)
 *
 * What it does:
 *  - POST /proxy   — receives SDK intake requests (same ?ddforward= protocol used in E2E tests)
 *                    parses profile, RUM, and log payloads without forwarding them to Datadog
 *  - GET  /events  — SSE stream; the page subscribes here to display captured data live
 */
import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { createIntakeProxyMiddleware } from '../../e2e/lib/framework/intakeProxyMiddleware.ts'
import type { IntakeRequest, ProfileIntakeRequest } from '../../e2e/lib/framework/intakeProxyMiddleware.ts'

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
// Express
// ---------------------------------------------------------------------------
const app = express()
app.use(cors())

// SSE — the page subscribes to receive live intake events
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

// Intake proxy — receives POST /proxy?ddforward=... from the SDK
app.post(
  '/proxy',
  createIntakeProxyMiddleware({
    onRequest: (request: IntakeRequest) => {
      if (request.intakeType === 'profile') {
        broadcast(summariseProfile(request as ProfileIntakeRequest))
      } else if (request.intakeType === 'rum') {
        broadcast({ type: 'rum', eventCount: request.events.length })
      }
    },
  })
)

http.createServer(app).listen(PORT, () => {
  console.log(`Proxy server listening on http://localhost:${PORT}`)
})

// ---------------------------------------------------------------------------
// Profile summariser
// ---------------------------------------------------------------------------
function summariseProfile(profile: ProfileIntakeRequest) {
  const thread = profile.event.tags_profiler.includes('thread:worker') ? 'worker' : 'main'
  const durationMs =
    new Date(profile.event.end).getTime() - new Date(profile.event.start).getTime()

  return {
    type: 'profile',
    thread,
    workerName: extractTag(profile.event.tags_profiler, 'worker.name'),
    correlationIds: extractAllTags(profile.event.tags_profiler, 'thread.correlation_id'),
    startTime: profile.event.start,
    endTime: profile.event.end,
    durationMs,
    sampleCount: profile.trace.samples?.length ?? 0,
    frameCount: profile.trace.frames?.length ?? 0,
    topFrames: topFrames(profile, 8),
    sessionId: profile.event.session?.id,
    tags: profile.event.tags_profiler,
  }
}

function extractTag(tagString: string, key: string): string | undefined {
  const match = tagString.split(',').find((t) => t.startsWith(`${key}:`))
  return match ? match.slice(key.length + 1) : undefined
}

function extractAllTags(tagString: string, key: string): string[] {
  return tagString
    .split(',')
    .filter((t) => t.startsWith(`${key}:`))
    .map((t) => t.slice(key.length + 1))
}

function topFrames(
  profile: ProfileIntakeRequest,
  n: number
): Array<{ name: string; resource: string | undefined; line: number | undefined; count: number }> {
  const { samples = [], stacks = [], frames = [], resources = [] } = profile.trace
  const counts = new Map<number, number>()

  for (const sample of samples) {
    let id = sample.stackId
    while (id !== undefined) {
      const stack = stacks[id]
      counts.set(stack.frameId, (counts.get(stack.frameId) ?? 0) + 1)
      id = stack.parentId
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([frameId, count]) => {
      const frame = frames[frameId]
      return {
        name: frame.name || '(anonymous)',
        resource: frame.resourceId !== undefined ? resources[frame.resourceId] : undefined,
        line: frame.line,
        count,
      }
    })
}
