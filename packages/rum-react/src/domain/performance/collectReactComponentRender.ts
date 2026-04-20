import type { Duration, TimeStamp } from '@datadog/browser-core'
import { getRunningReactProfiler } from '../reactPlugin'

export function collectReactComponentRender({
  component,
  startTime,
  duration,
  phase,
  renderPhaseDuration,
  layoutEffectPhaseDuration,
  effectPhaseDuration,
  baseDurationMs,
}: {
  component: string
  startTime: TimeStamp
  duration: Duration
  phase: 'mount' | 'update' | 'nested-update'
  renderPhaseDuration?: Duration
  layoutEffectPhaseDuration?: Duration
  effectPhaseDuration?: Duration
  /** Base duration in milliseconds as reported by React.Profiler (already a float ms value). */
  baseDurationMs?: number
}) {
  getRunningReactProfiler()?.addComponentRender({
    component,
    startTime: startTime as unknown as number,
    duration,
    phase,
    renderPhaseDuration,
    layoutEffectPhaseDuration,
    effectPhaseDuration,
    baseDurationMs,
  })
}
