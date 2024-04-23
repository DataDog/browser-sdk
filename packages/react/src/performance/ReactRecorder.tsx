import * as React from 'react'
import { v4 as uuidv4 } from 'uuid'

import { DatadogContext } from '../lib/datadogContext'
import { count } from './count'
// import { useUserActionCounts } from './react-count'
import { ReactRecorderContext } from './reactRecorder.context'
import { useTimingRecorder } from './timing'

const SAFETY_BURST_DEBOUNCE_DELAY = 50 // ms

const useDefaultId = (id?: string | number) =>
  React.useMemo(() => (id === undefined ? uuidv4() : typeof id === 'number' ? id.toString() : id), [id])

const useReactMountRecorder = (
  _: string,
  context: object,
  {
    isEnabled = true,
    burstDebounce = 500,
  }: {
    isEnabled?: boolean
    burstDebounce?: number
  }
) => {
  // useUserActionCounts(componentName, id, isEnabled)

  const burstTimeout = React.useRef<ReturnType<typeof setTimeout> | false>()
  const burstRenderCount = React.useRef(0)

  // we do this to guard against sending too many metrics
  const debounceDelay = Math.max(burstDebounce, SAFETY_BURST_DEBOUNCE_DELAY)
  burstRenderCount.current += 1
  if (burstTimeout.current) {
    clearTimeout(burstTimeout.current)
  }

  burstTimeout.current =
    isEnabled &&
    setTimeout(() => {
      burstTimeout.current = undefined
      // emit the amount of renders in a given burst
      count({
        name: 'react.burst_renders',
        value: burstRenderCount.current,
        context: {
          ...context,
          debounce: burstDebounce,
        },
      })
      burstRenderCount.current = 0
    }, debounceDelay)

  React.useEffect(() => {
    if (isEnabled) {
      count({ name: 'react.mount', context })
    }

    return () => {
      if (burstTimeout.current) {
        clearTimeout(burstTimeout.current)
      }
      burstTimeout.current = undefined
    }
    // FIXME: Update the dependency list to be exhaustive, and delete this comment.
  }, [])
}

export const ReactRecorder = ({
  name: componentName,
  context: contextProp,
  children,
  burstDebounce = 500,
}: {
  name: string
  context?: object
  children?: React.ReactNode
  burstDebounce?: number
}) => {
  const { id: contextId } = React.useContext(ReactRecorderContext)
  const { datadogReactRum } = React.useContext(DatadogContext)

  const id = useDefaultId(contextId)
  const isFirstRender = React.useRef(true)

  const context = {
    component: componentName,
    isFirstRender: isFirstRender.current,
    ...contextProp,
  }

  useReactMountRecorder(componentName, context, {
    burstDebounce,
  })

  const renderPhaseRecorder = useTimingRecorder('react.phase.render', {
    id: `${componentName}-${id}`,
    context,
  })

  const layoutEffectPhaseRecorder = useTimingRecorder('react.phase.layout_effect', {
    id: `${componentName}-${id}`,
    context,
  })

  const effectPhaseRecorder = useTimingRecorder('react.phase.effect', {
    id: `${componentName}-${id}`,
    context,
  })

  const onEffectEnd = () => {
    /**
     * In order to have an accurate measurement of the total render time,
     * we have to record render, layout effect and effect phases separately.
     * Starting a timer in render and stopping it in a `useEffect` doesn't
     * work because it would include the reconcilation and the commit phase of
     * React, which depends on where the setState was triggered.
     */
    const totalTime =
      renderPhaseRecorder.getLastMeasurement()! +
      layoutEffectPhaseRecorder.getLastMeasurement()! +
      effectPhaseRecorder.getLastMeasurement()!

    /**
     * Send a custom vital tracking this duration
     */
    console.log('>>>', componentName, totalTime)

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
          renderPhaseRecorder.start()
          /* @ts-expect-error - still experimental */
          datadogReactRum?.startDurationVital?.(`render-${componentName}`, {
            startTime: Date.now(),
            context: {
              component: componentName,
              isFirstRender: isFirstRender.current,
              framework: 'react',
            },
          })
        }}
        onLayoutEffect={() => layoutEffectPhaseRecorder.start()}
        onEffect={() => effectPhaseRecorder.start()}
      />
      {children}
      <LifeCycle
        onRender={() => {
          renderPhaseRecorder.stop()
        }}
        onLayoutEffect={() => {
          layoutEffectPhaseRecorder.stop()
        }}
        onEffect={() => {
          effectPhaseRecorder.stop()
          /* @ts-expect-error - still experimental */
          datadogReactRum?.stopDurationVital?.(`render-${componentName}`, {
            startTime: Date.now(),
            context: {
              component: componentName,
              isFirstRender: isFirstRender.current,
              framework: 'react',
            },
          })
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

export const withReactRecorder =
  <Props extends object>(recorderProps: Parameters<typeof ReactRecorder>[0], Component: React.ComponentType<Props>) =>
  (props: Props) => (
    <ReactRecorder {...recorderProps}>
      <Component {...props} />
    </ReactRecorder>
  )

/**
 * useReactFlushedRecorder hook measures the time it takes for React to render,
 * reconcile, and update the DOM from the time the hook is called until the
 * browser has started to flush changes to the screen for the next frame.
 */
export const useReactFlushedRecorder = (
  componentName: string,
  context?: object,
  {
    isEnabled = true,
  }: {
    isEnabled?: boolean
  } = {}
) => {
  const recorder = useTimingRecorder(componentName, {
    context,
  })

  if (isEnabled) {
    recorder.start()
  }

  React.useEffect(() => {
    requestAnimationFrame(() => {
      if (isEnabled) {
        recorder.stop()
      }
    })
  })
}

// A React Component wrapper for useReactFlushedRecorder.
export const ReactFlushedRecorder = (props: { name: string; context?: object; children?: React.ReactNode }) => {
  const { name, context: contextProp, children } = props
  const isFirstRender = React.useRef(true)
  const context = {
    isFirstRender: isFirstRender.current,
    ...contextProp,
  }
  useReactFlushedRecorder(name, context)
  isFirstRender.current = false
  return <>{children}</>
}
