import type { ProfilerTrace } from '@datadog/js-core/util'
import { mockable } from '@datadog/js-core/util'
import type { ClocksState } from '@datadog/js-core/time'
import { elapsed, clocksOrigin, clocksNow } from '@datadog/js-core/time'
import type { LifeCycle, RumConfiguration, ViewHistory } from '@datadog/browser-rum-core'
import type { BrowserProfilerTrace } from '../../types'
import type { ProfilingPayload, RUMProfilerConfiguration } from './types'
import { createLongTaskHistory } from './contexts/longTaskHistory'
import { createActionHistory } from './contexts/actionHistory'
import { createVitalHistory } from './contexts/vitalHistory'
import { createProfilerViewHistory } from './contexts/profilerViewHistory'
import { buildProfilerDebugIds } from './profilerDebugIds'
import { buildProfileEvent } from './buildProfileEvent'

export function createProfileAssembly(
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  viewHistory: ViewHistory,
  profilerConfiguration: RUMProfilerConfiguration,
  emitPayload: (payload: ProfilingPayload) => void
) {
  const longTaskHistory = mockable(createLongTaskHistory)(lifeCycle)
  const actionHistory = mockable(createActionHistory)(lifeCycle)
  const vitalHistory = mockable(createVitalHistory)(lifeCycle)
  const profilerViewHistory = mockable(createProfilerViewHistory)(lifeCycle, viewHistory)

  function assemble(trace: ProfilerTrace, startClocks: ClocksState, sessionId: string | undefined) {
    const endClocks = clocksNow()
    const duration = elapsed(startClocks.relative, endClocks.relative)
    const views = profilerViewHistory.findAll(startClocks.relative, duration).reverse()
    const longTasks = longTaskHistory.findAll(startClocks.relative, duration)
    const actions = actionHistory.findAll(startClocks.relative, duration)
    const vitals = vitalHistory.findAll(startClocks.relative, duration).map((vital) => ({
      id: vital.id,
      label: vital.label,
      startClocks: vital.startClocks,
      duration: vital.duration,
    }))
    const isBelowDurationThreshold = duration < profilerConfiguration.minProfileDurationMs

    if (longTasks.length === 0 && isBelowDurationThreshold) {
      // Skip very short profiles to reduce noise and cost, but keep them if they contain long tasks.
      return
    }

    // Enrich trace with time and instance data — create new object to avoid mutating the raw trace
    const enrichedTrace: BrowserProfilerTrace = {
      ...trace,
      startClocks,
      endClocks,
      clocksOrigin: clocksOrigin(),
      longTasks,
      actions,
      vitals,
      views,
      sampleInterval: profilerConfiguration.sampleIntervalMs,
      debugIds: buildProfilerDebugIds(trace.resources),
    }
    emitPayload({
      profile: buildProfileEvent(enrichedTrace, configuration, sessionId),
      trace: enrichedTrace,
    })
  }

  return { assemble }
}
