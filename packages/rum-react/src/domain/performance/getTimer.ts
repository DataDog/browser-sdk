import { v4 as uuid } from 'uuid'

export function getTimer(name: string) {
  const id = uuid()
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
