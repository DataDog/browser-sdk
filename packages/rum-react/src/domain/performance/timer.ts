export function createTimer() {
  let duration: number | undefined
  let startTime: number | undefined

  function startTimer() {
    const start = performance.now()
    startTime = performance.timeOrigin + start
  }

  function stopTimer() {
    duration = performance.timeOrigin + performance.now() - startTime!
  }

  function getDuration() {
    return duration
  }

  function getStartTime() {
    return startTime
  }

  return { startTimer, stopTimer, getDuration, getStartTime }
}
