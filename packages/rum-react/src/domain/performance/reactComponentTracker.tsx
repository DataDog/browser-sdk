import * as React from 'react'
import { createTimer } from './timer'
import { addDurationVital } from './addDurationVital'

// eslint-disable-next-line
export const UNSTABLE_ReactComponentTracker = ({
  name: componentName,
  children,
}: {
  name: string
  children?: React.ReactNode
}) => {
  const isFirstRender = React.useRef(true)

  const renderTimer = createTimer()
  const effectTimer = createTimer()
  const layoutEffectTimer = createTimer()

  const onEffectEnd = () => {
    const renderDuration = renderTimer.getDuration() ?? 0
    const effectDuration = effectTimer.getDuration() ?? 0
    const layoutEffectDuration = layoutEffectTimer.getDuration() ?? 0

    const totalRenderTime = renderDuration + effectDuration + layoutEffectDuration

    addDurationVital('reactComponentRender', {
      description: componentName,
      startTime: renderTimer.getStartTime() ?? 0,
      duration: totalRenderTime,
      context: {
        is_first_render: isFirstRender.current,
        render_phase_duration: renderDuration,
        effect_phase_duration: effectDuration,
        layout_effect_phase_duration: layoutEffectDuration,
        framework: 'react',
      },
    })

    isFirstRender.current = false
  }

  /**
   * In react, children are rendered sequentially
   * in the order they are defined. that's why we
   * can measure perf timings of a component by
   * starting recordings in the component above
   * and stopping them in the component below.
   */
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
