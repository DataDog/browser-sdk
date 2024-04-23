import { dateNow } from '@datadog/browser-core'

// If client supports performance API
export const isPerfSupported = () =>
  window &&
  window.performance &&
  /* @ts-expect-error: This condition will always return true since this function is always defined. */
  window.performance.mark &&
  /* @ts-expect-error: This condition will always return true since this function is always defined. */
  window.performance.getEntriesByName &&
  /* @ts-expect-error: This condition will always return true since this function is always defined. */
  window.performance.measure &&
  /* @ts-expect-error: This condition will always return true since this function is always defined. */
  window.performance.now &&
  window.performance.timing

// Use naviagtionStart as beginning time, otherwise make do with the script execution time
export const getPerfStartTime = () => (isPerfSupported() ? window.performance.timeOrigin : new Date().getTime())

// Polyfill to use high res performance.now() at current epoch
export const getTimeNow = () => {
  if (isPerfSupported()) {
    return () => window.performance.now() + getPerfStartTime()
  }
  return () => dateNow()
}

export const getPerformanceNow = () => {
  if (isPerfSupported()) {
    return () => performance.now()
  }
  return () => dateNow() - getPerfStartTime()
}

export const performanceStart = (performanceName: string) => {
  if (!isPerfSupported()) {
    return
  }

  performanceClear(performanceName)
  performance.mark(`${performanceName}-start`)
}

export const performanceStep = (
  performanceName: string,
  stepName: string,
  mode: 'first' | 'last' = 'last' // specify how to handle multiple steps with same name, default "last"
) => {
  if (!isPerfSupported() || performance.getEntriesByName(`${performanceName}-start`).length === 0) {
    return
  }

  const isStepExist = performance.getEntriesByName(`${performanceName}-${stepName}`).length > 0

  if ((mode === 'first' && !isStepExist) || mode === 'last') {
    return performance.mark(`${performanceName}-${stepName}`)
  }
  return
}

export const performanceClear = (performanceName: string) => {
  if (!isPerfSupported()) {
    return
  }

  const marks = performance.getEntriesByType('mark')
  marks.forEach((mark) => {
    if (mark.name.startsWith(performanceName)) {
      performance.clearMarks(mark.name)
    }
  })
  performance.clearMeasures(performanceName)
}

export const performanceEnd = (performanceName: string) => {
  if (!isPerfSupported() || performance.getEntriesByName(`${performanceName}-start`).length === 0) {
    return
  }

  performance.mark(`${performanceName}-end`)

  const steps = getSteps(performanceName)
  const duration = performanceDuration(performanceName)

  performanceClear(performanceName)

  return {
    duration,
    steps,
  }
}

/**
 * Same as `performanceEnd`, however also adds a performance mark
 * at the end with the duration + additional context data.
 *
 * @usage
 * ```
 * // No additional details added to the mark (only default `duration`)
 * performanceEndAndMark('mark_name')
 *
 * // Additional details will be added to the mark
 * performanceEndAndMark('mark_name', {
 *     isLive: true
 * })
 *
 * // Custom function can also be used to build the additional details object
 * performanceEndAndMark('mark_name', ({ steps }) => ({
 *     timeBetweenSomeSteps: steps.step_a.startTime - steps.step_b.startTime
 * }))
 * ```
 */
export const performanceEndAndMark = (
  performanceName: string,
  additionalDetails: object | ((context: { duration: number; steps: Record<string, PerformanceEntry> }) => object) = {}
) => {
  const context = performanceEnd(performanceName)

  if (!context) {
    return
  }

  const details = typeof additionalDetails === 'function' ? additionalDetails(context) : additionalDetails

  performance.mark(performanceName, {
    detail: Object.assign(details, {
      duration: context.duration,
    }),
  })

  return context
}

/**
 * Type and runtime safe call to performance.mark() API.
 * Supports `detail` API.
 */
export const performanceMark = (...args: Parameters<typeof performance.mark>) => {
  if (!isPerfSupported()) {
    return
  }

  performance.mark(...args)
}

export const getSteps = (performanceName: string) => {
  const steps: { [key: string]: PerformanceEntry } = {}

  if (!isPerfSupported()) {
    return steps
  }

  performance
    .getEntriesByType('mark')
    .filter((mark) => mark.name.indexOf(performanceName) !== -1)
    .forEach((mark) => {
      steps[mark.name.replace(`${performanceName}-`, '')] = mark
    })

  return steps
}

const performanceDuration = (performanceName: string) => {
  if (!isPerfSupported()) {
    return -1
  }

  try {
    performance.measure(performanceName, `${performanceName}-start`, `${performanceName}-end`)
    const measures = performance.getEntriesByName(performanceName)
    const measureValue = measures[0]

    performance.clearMeasures(performanceName)

    return measureValue.duration
  } catch (e) {
    // avoid crashing if a start marks is missing
    // performance should'nt be able to break the app
    return -1
  }
}

export const getDuration = (
  performanceObj: {
    duration: number
    steps: {
      [key: string]: PerformanceEntry
    }
  },
  startStep: string,
  endStep: string
) => {
  if (!isPerfSupported()) {
    return -1
  }
  try {
    return performanceObj.steps[endStep].startTime - performanceObj.steps[startStep].startTime
  } catch (e) {
    // avoid crashing if a start marks is missing
    // performance should'nt be able to break the app
    return -1
  }
}

// Return memory usage info if available
export const measureMem = () => {
  // Ensure we can use performance.memory. Chrome only as of 2016.
  if (!isPerfSupported()) {
    return {}
  }
  // Cast performance to 'any' type to avoid typescript error
  // Indeed the Performance type doesn't have 'memory' attribute
  // probably because memory is only on Chrome
  const perf: any = performance
  if (!perf.memory) {
    return {}
  }
  const mem = perf.memory
  return {
    usedJSHeapSize: mem.usedJSHeapSize,
    jsHeapSizeLimit: mem.jsHeapSizeLimit,
    totalJSHeapSize: mem.totalJSHeapSize,
  }
}
