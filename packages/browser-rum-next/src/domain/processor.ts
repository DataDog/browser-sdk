import type { Pipeline, NetworkRequestResource } from '@datadog/core-next'
import { flattenCauses, extractFingerprint } from '@datadog/core-next'
import type { ResourceTimingEntry } from '../performance/types'
import type { RumConfig } from './configuration'
import { ResourceMatcher } from './resourceMatcher'

interface ProcessorDependencies {
  pipeline: Pipeline<Record<string, unknown>>
  config: RumConfig
}

function startProcessor({ pipeline, config }: ProcessorDependencies): void {
  const matcher = new ResourceMatcher()

  // Buffer network requests for correlation
  pipeline.subscribe('resource:network_request', (data) => {
    matcher.add(data as NetworkRequestResource)
  })

  // Performance entries → observation:rum_resource
  if (config.trackResources) {
    pipeline.subscribe('resource:performance_entry', (data) => {
      const entry = data as ResourceTimingEntry
      const networkMatch = matcher.match(entry.name, entry.startTime)

      const resource: Record<string, unknown> = {
        type: 'resource',
        date: Math.round(performance.timeOrigin + entry.startTime),
        resource: {
          url: entry.name,
          type: entry.initiatorType,
          duration: entry.duration,
          status_code: entry.responseStatus || networkMatch?.status,
          method: networkMatch?.method,
          size: entry.decodedBodySize,
          encoded_body_size: entry.encodedBodySize,
          decoded_body_size: entry.decodedBodySize,
          transfer_size: entry.transferSize,
          protocol: entry.nextHopProtocol || undefined,
          delivery_type: entry.deliveryType || undefined,
          render_blocking_status: entry.renderBlockingStatus || undefined,
          redirect: computePhase(entry.redirectStart, entry.redirectEnd),
          dns: computePhase(entry.domainLookupStart, entry.domainLookupEnd),
          connect: computePhase(entry.connectStart, entry.connectEnd),
          ssl: computePhase(entry.secureConnectionStart, entry.connectEnd),
          first_byte: computePhase(entry.requestStart, entry.responseStart),
          download: computePhase(entry.responseStart, entry.responseEnd),
        },
      }

      pipeline.publish('observation:rum_resource', resource)
    })
  }

  // Runtime errors → observation:rum_error
  if (config.trackErrors) {
    pipeline.subscribe('resource:runtime_error', (data) => {
      const error = data as Record<string, unknown>
      const errorObj = error.error as Error | undefined

      pipeline.publish('observation:rum_error', {
        type: 'error',
        date: Date.now(),
        error: {
          message: error.message,
          type: error.type,
          stack: error.stack,
          source: 'source',
          fingerprint: extractFingerprint(errorObj),
          causes: errorObj ? flattenCauses(errorObj) : undefined,
        },
      })
    })
  }

  // Long tasks → observation:rum_long_task
  if (config.trackLongTasks) {
    pipeline.subscribe('resource:long_task', (data) => {
      const entry = data as { startTime: number; duration: number }
      pipeline.publish('observation:rum_long_task', {
        type: 'long_task',
        date: Math.round(performance.timeOrigin + entry.startTime),
        long_task: { duration: entry.duration },
      })
    })

    pipeline.subscribe('resource:long_animation_frame', (data) => {
      const entry = data as {
        startTime: number
        duration: number
        blockingDuration: number
        renderStart: number
        styleAndLayoutStart: number
        scripts: Array<{
          sourceURL: string
          sourceFunctionName: string
          invoker: string
          invokerType: string
          duration: number
          executionStart: number
          pauseDuration: number
          forcedStyleAndLayoutDuration: number
          windowAttribution: string
        }>
      }

      pipeline.publish('observation:rum_long_task', {
        type: 'long_task',
        date: Math.round(performance.timeOrigin + entry.startTime),
        long_task: {
          duration: entry.duration,
          blocking_duration: entry.blockingDuration,
          render_start: entry.renderStart,
          style_and_layout_start: entry.styleAndLayoutStart,
        },
        scripts: entry.scripts?.map((s) => ({
          source_url: s.sourceURL,
          source_function_name: s.sourceFunctionName,
          invoker: s.invoker,
          invoker_type: s.invokerType,
          duration: s.duration,
          execution_start: s.executionStart,
          pause_duration: s.pauseDuration,
          forced_style_and_layout_duration: s.forcedStyleAndLayoutDuration,
          window_attribution: s.windowAttribution,
        })),
      })
    })
  }
}

function computePhase(start: number, end: number): { duration: number; start: number } | undefined {
  if (start === 0 || end === 0 || start >= end) return undefined
  return { duration: end - start, start }
}

export { startProcessor }
export type { ProcessorDependencies }
