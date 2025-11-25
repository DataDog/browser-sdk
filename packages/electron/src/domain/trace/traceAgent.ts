import { createServer } from 'node:http'
import type { Observable } from '@datadog/browser-core'
import { HookNames, DISCARDED } from '@datadog/browser-core'
import { decode } from '@msgpack/msgpack'
import type { Hooks } from '../../hooks'
import type { Trace } from './trace'
import tracer from './tracer'
import { createIdentifier } from './id'

export function createDdTraceAgent(onTraceObservable: Observable<Trace>, hooks: Hooks) {
  const server = createServer()

  server.on('request', (req, res) => {
    // Collect binary data chunks
    const chunks: Buffer[] = []

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    req.on('end', () => {
      const buffer = Buffer.concat(chunks)

      const decoded = decode(buffer) as Array<
        Array<{ name: string; type: string; meta: { [key: string]: unknown }; [key: string]: unknown }>
      >

      const defaultRumEventAttributes = hooks.triggerHook(HookNames.Assemble, {
        eventType: 'span' as any,
      })!

      if (defaultRumEventAttributes === DISCARDED) {
        return
      }

      for (const trace of decoded) {
        const filteredTrace = trace
          .filter((span) => !isSdkRequest(span))
          .map((span) => ({
            // rewrite ids
            ...span,
            trace_id: createIdentifier(`${span.trace_id as number}`, 10).toString(16),
            span_id: createIdentifier(`${span.span_id as number}`, 10).toString(16),
            parent_id: createIdentifier(`${span.parent_id as number}`, 10).toString(16),
            meta: {
              ...span.meta,
              '_dd.application.id': defaultRumEventAttributes.application!.id,
              '_dd.session.id': defaultRumEventAttributes.session!.id,
              '_dd.view.id': defaultRumEventAttributes.view!.id,
            },
          }))

        if (filteredTrace.length > 0) {
          onTraceObservable.notify(filteredTrace)
        }
      }
    })

    // Respond with the agent API format that dd-trace expects
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        rate_by_service: {
          'service:dd-trace,env:prod': 1,
        },
      })
    )
  })

  server.listen(0, () => {
    const addressInfo = server.address()
    if (!addressInfo) {
      throw new Error('Failed to get server address')
    }

    if (typeof addressInfo === 'string') {
      throw new Error(`Address is a string: ${addressInfo}`)
    }

    const { port } = addressInfo
    const url = `http://127.0.0.1:${port}`

    // console.log('agents url', url)
    tracer.setUrl(url)
  })
}

function isSdkRequest(span: any) {
  const spanRequestUrl = span.meta['http.url'] as string | undefined
  return (
    (spanRequestUrl &&
      (spanRequestUrl.startsWith('http://127.0.0.1') ||
        spanRequestUrl.startsWith('https://browser-intake-datadoghq.com/'))) ||
    (span.resource as string).startsWith('browser-intake-datadoghq.com')
  )
}
