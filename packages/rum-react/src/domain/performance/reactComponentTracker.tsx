import * as React from 'react'
import { getTimer } from './getTimer'
import { addDurationVital } from './addDurationVital'

export const ReactComponentTracker = ({
  name: componentName,
  children,
}: {
  name: string
  context?: object
  children?: React.ReactNode
  burstDebounce?: number
}) => {
  const isFirstRender = React.useRef(true)

  const renderTimer = getTimer()
  const effectTimer = getTimer()
  const layoutEffectTimer = getTimer()

  const onEffectEnd = () => {
    const renderDuration = renderTimer.getDuration()
    const effectDuration = effectTimer.getDuration()
    const layoutEffectDuration = layoutEffectTimer.getDuration()

    const totalRenderTime = renderDuration + effectDuration + layoutEffectDuration

    addDurationVital(`${componentName}`, {
      startTime: renderTimer.getStartTime(),
      duration: totalRenderTime,
      context: {
        isFirstRender: isFirstRender.current,
        renderPhaseDuration: renderDuration,
        effectPhaseDuration: effectDuration,
        layoutEffectPhaseDuration: layoutEffectDuration,
        componentName,
        framework: 'react',
      },
    })

    /**
     * Send a custom vital tracking this duration
     */

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
        onRender={() => {
          renderTimer.startTimer()
        }}
        onLayoutEffect={() => {
          layoutEffectTimer.startTimer()
        }}
        onEffect={() => {
          effectTimer.startTimer()
        }}
      />
      {children}
      <LifeCycle
        onRender={() => {
          renderTimer.stopTimer()
        }}
        onLayoutEffect={() => {
          layoutEffectTimer.stopTimer()
        }}
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
