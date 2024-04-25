import * as React from 'react'

import { DatadogContext } from '../lib/datadogContext'
import { count } from './count'

const SAFETY_BURST_DEBOUNCE_DELAY = 50 // ms

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
  const { datadogReactRum } = React.useContext(DatadogContext)

  const isFirstRender = React.useRef(true)

  const context = {
    component: componentName,
    isFirstRender: isFirstRender.current,
    ...contextProp,
  }

  useReactMountRecorder(componentName, context, {
    burstDebounce,
  })

  const onEffectEnd = () => {
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
          if (datadogReactRum !== undefined && 'startDurationVital' in datadogReactRum) {
            // @ts-expect-error experimental-feature
            datadogReactRum.startDurationVital(`render-${componentName}`, {
              startTime: Date.now(),
              context: {
                component: componentName,
                isFirstRender: isFirstRender.current,
                framework: 'react',
              },
            })
          }
        }}
        onLayoutEffect={() => {}}
        onEffect={() => {}}
      />
      {children}
      <LifeCycle
        onRender={() => {}}
        onLayoutEffect={() => {}}
        onEffect={() => {
          if (datadogReactRum !== undefined && 'stopDurationVital' in datadogReactRum) {
            // @ts-expect-error experimental-feature
            datadogReactRum.stopDurationVital(`render-${componentName}`, {
              startTime: Date.now(),
              context: {
                component: componentName,
                isFirstRender: isFirstRender.current,
                framework: 'react',
              },
            })
          }
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
