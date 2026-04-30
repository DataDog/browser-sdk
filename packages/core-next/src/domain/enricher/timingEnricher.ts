import { enricher } from './factory'
import { toServerDuration } from '../time'
import type { Duration } from '../time'

const DURATION_PATHS = [
  // View
  'view.time_spent',
  'view.first_byte',
  'view.dom_interactive',
  'view.dom_content_loaded',
  'view.dom_complete',
  'view.load_event',
  'view.first_contentful_paint',
  'view.largest_contentful_paint',
  'view.interaction_to_next_paint',
  'view.interaction_to_next_paint_time',
  'view.loading_time',
  'view.cumulative_layout_shift_time',
  'performance.fcp.timestamp',
  'performance.lcp.timestamp',
  'performance.inp.duration',
  // Resource
  'resource.duration',
  'resource.redirect.duration',
  'resource.redirect.start',
  'resource.dns.duration',
  'resource.dns.start',
  'resource.connect.duration',
  'resource.connect.start',
  'resource.ssl.duration',
  'resource.ssl.start',
  'resource.first_byte.duration',
  'resource.first_byte.start',
  'resource.download.duration',
  'resource.download.start',
  'resource.worker.duration',
  'resource.worker.start',
  // Action
  'action.loading_time',
  // Long task
  'long_task.duration',
  'long_task.blocking_duration',
  'long_task.start_time',
  'long_task.first_ui_event_timestamp',
  'long_task.render_start',
  'long_task.style_and_layout_start',
]

const SCRIPT_DURATION_FIELDS = ['duration', 'execution_start', 'pause_duration', 'forced_style_and_layout_duration']

function convertPath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('.')
  let current: unknown = obj
  for (let i = 0; i < parts.length - 1; i++) {
    current = (current as Record<string, unknown>)[parts[i]]
    if (!current || typeof current !== 'object') return
  }
  const lastKey = parts[parts.length - 1]
  const target = current as Record<string, unknown>
  if (typeof target[lastKey] === 'number') {
    target[lastKey] = toServerDuration(target[lastKey] as Duration)
  }
}

function timingEnricher() {
  return enricher({
    name: 'timing',
    transform: (data: Record<string, unknown>) => {
      const result = { ...data }

      for (const path of DURATION_PATHS) {
        convertPath(result, path)
      }

      const scripts = result.scripts as Array<Record<string, unknown>> | undefined
      if (Array.isArray(scripts)) {
        result.scripts = scripts.map((script) => {
          const converted = { ...script }
          for (const field of SCRIPT_DURATION_FIELDS) {
            if (typeof converted[field] === 'number') {
              converted[field] = toServerDuration(converted[field] as Duration)
            }
          }
          return converted
        })
      }

      // Convert _dd.page_states[].start
      const dd = result._dd as Record<string, unknown> | undefined
      if (dd) {
        const pageStates = dd.page_states as Array<Record<string, unknown>> | undefined
        if (Array.isArray(pageStates)) {
          dd.page_states = pageStates.map((entry) => {
            const converted = { ...entry }
            if (typeof converted.start === 'number') {
              converted.start = toServerDuration(converted.start as Duration)
            }
            return converted
          })
        }
      }

      return result
    },
  })
}

export { timingEnricher }
