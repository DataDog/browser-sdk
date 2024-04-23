import * as React from 'react'
import { v4 as uuidv4 } from 'uuid'
import { performanceClear, performanceEnd, performanceStart } from './lib/timing'
export interface TimingRecorderOptions {
  context?: object
  id?: string
}

const validTimings: Set<string> = new Set()

const onTaint = () => {
  validTimings.clear()
}

if (document) {
  /* eslint-disable local-rules/disallow-zone-js-patched-values */
  document.addEventListener('blur', onTaint, { passive: true })
  document.addEventListener('focus', onTaint, { passive: true })
  document.addEventListener('visibilitychange', onTaint, { passive: true })
  /* eslint-disable */
}

// Available in dashboard as metrics: `dd.frontend.perf.timing.${name}`
export const getTimingRecorder = (name: string, { context, id = uuidv4() }: TimingRecorderOptions | undefined = {}) => {
  const uniqueName = `${name}-${id}`
  let lastMeasurement: number | undefined
  let storedContext: TimingRecorderOptions['context'] | undefined = context

  return {
    start: () => {
      if (!document?.hidden) {
        performanceStart(uniqueName)
        validTimings.add(uniqueName)
      }
    },
    stop: () => {
      const result = performanceEnd(uniqueName)
      if (!document?.hidden && validTimings.has(uniqueName) && result !== undefined) {
        lastMeasurement = result.duration
      }
      validTimings.delete(uniqueName)
      return result
    },
    getLastMeasurement: () => lastMeasurement,
    getContext: () => storedContext,
    addContext: (additionalContext: TimingRecorderOptions['context']) => {
      storedContext = { ...storedContext, ...additionalContext }
    },
    cancel: () => {
      performanceClear(uniqueName)
    },
  }
}

export function useTimingRecorder(
  name: string,
  { context, id }: TimingRecorderOptions | undefined = {}
): ReturnType<typeof getTimingRecorder> {
  const contextRef = React.useRef(context)
  contextRef.current = context
  const recorder = React.useMemo(() => {
    return getTimingRecorder(name, {
      context: contextRef.current,
      id,
    })
  }, [name, id])

  return recorder
}
