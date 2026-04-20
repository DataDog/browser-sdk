import React from 'react'
import type { Duration, RelativeTime } from '@datadog/browser-core'
import { getTimeStamp } from '@datadog/browser-core'
import { isReactProfilingRunning } from '../reactPlugin'
import { createTimer } from './timer'
import { collectReactComponentRender } from './collectReactComponentRender'

/**
 * Context attached to every `react_component_render` event, regardless of
 * whether profiling mode is enabled or not.
 */
export interface ReactProfilerContext {
  framework: 'react'
  /**
   * Whether this is the first render (mount) or a subsequent update.
   * Matches React Profiler's `phase` values. In standard mode, `nested-update` is not
   * distinguishable from `update` and will be reported as `update`.
   */
  phase: 'mount' | 'update' | 'nested-update'
  /**
   * Time spent in the render phase.
   */
  render_phase_duration?: number
  /**
   * Time spent in `useLayoutEffect`.
   */
  layout_effect_phase_duration?: number
  /**
   * Time spent in `useEffect`.
   */
  effect_phase_duration?: number
  /**
   * Estimated time to re-render this subtree from scratch (ignoring memoization).
   * Only present in profiling mode.
   */
  base_duration?: number
}

/**
 * Track the performance of a React component or subtree and report it as a
 * `react_component_render` RUM event.
 *
 * Uses `<React.Profiler>` wrapping a sentinel-component approach. In standard production
 * builds, `<React.Profiler>` is a no-op, so only the sentinel fires and emits an event
 * with render/layoutEffect/effect phase durations. When the profiling build is used in
 * production, `<React.Profiler>` fires first (during the layout phase) and emits a richer
 * event including `base_duration` and accurate `nested-update` detection?
 */
export const ReactProfiler = ({ name, children }: { name: string; children?: React.ReactNode }) => {
  if (!isReactProfilingRunning()) {
    return <>{children}</>
  }

  return (
    <Profiler name={name}>
      <StandardProfiler name={name}>{children}</StandardProfiler>
    </Profiler>
  )
}

interface ProfilerComposedProps {
  name: string
  children?: React.ReactNode
}

/**
 * Composed mode — React.Profiler wraps the sentinel approach.
 * React.Profiler fires during layout phase (before useEffect).
 * Sentinel's onEffectEnd fires in useEffect (after layout).
 */
function Profiler({ name, children }: ProfilerComposedProps) {
  const handleRender: React.ProfilerOnRenderCallback = React.useCallback(
    (id, phase, actualDuration, baseDuration, startTime) => {
      collectReactComponentRender({
        component: id,
        startTime: getTimeStamp(startTime as RelativeTime),
        duration: actualDuration as Duration,
        phase,
        baseDurationMs: baseDuration,
      })
    },
    []
  )

  return (
    <React.Profiler id={name} onRender={handleRender}>
      {children}
    </React.Profiler>
  )
}

interface StandardProfilerProps {
  name: string
  children?: React.ReactNode
}

/**
 * Sentinel mode — bracket the tracked subtree with LifeCycle components.
 */
function StandardProfiler({ name, children }: StandardProfilerProps) {
  const isFirstRender = React.useRef(true)

  const renderTimer = createTimer()
  const effectTimer = createTimer()
  const layoutEffectTimer = createTimer()

  const onEffectEnd = () => {
    const phase = isFirstRender.current ? ('mount' as const) : ('update' as const)
    isFirstRender.current = false

    const startTime = renderTimer.getStartTime()
    const renderDuration = renderTimer.getDuration()
    const effectDuration = effectTimer.getDuration()
    const layoutEffectDuration = layoutEffectTimer.getDuration()

    if (startTime === undefined) {
      return
    }

    collectReactComponentRender({
      component: name,
      startTime,
      duration: ((renderDuration ?? 0) + (effectDuration ?? 0) + (layoutEffectDuration ?? 0)) as Duration,
      phase,
      renderPhaseDuration: renderDuration ?? undefined,
      layoutEffectPhaseDuration: layoutEffectDuration ?? undefined,
      effectPhaseDuration: effectDuration ?? undefined,
    })
  }

  return (
    <>
      <LifeCycle
        onRender={renderTimer.startTimer}
        onLayoutEffect={layoutEffectTimer.startTimer}
        onEffect={effectTimer.startTimer}
      />
      {children}
      <LifeCycle
        onRender={renderTimer.stopTimer}
        onLayoutEffect={layoutEffectTimer.stopTimer}
        onEffect={() => {
          effectTimer.stopTimer()
          onEffectEnd()
        }}
      />
    </>
  )
}

function LifeCycle({
  onRender,
  onLayoutEffect,
  onEffect,
}: {
  onRender: () => void
  onLayoutEffect: () => void
  onEffect: () => void
}) {
  onRender()
  React.useLayoutEffect(onLayoutEffect)
  React.useEffect(onEffect)
  return null
}
