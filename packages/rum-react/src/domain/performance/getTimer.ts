import { generateUUID } from '@datadog/browser-core'

export function getTimer(name: string) {
  const id = generateUUID()
  let measure: PerformanceMeasure
  let startTime: number

  function startTimer() {
    const start = performance.mark(`${name}-${id}`)
    startTime = start.startTime
  }

  function stopTimer() {
    measure = performance.measure(`measure-${name}-${id}`, `${name}-${id}`)
  }

  function getDuration() {
    return measure ? measure.duration : 0
  }

  function getStartTime() {
    return startTime
  }

  return { startTimer, stopTimer, getDuration, getStartTime }
}
