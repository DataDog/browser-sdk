export function getTimer() {
  let duration: number
  let startTime: number

  function startTimer() {
    const start = performance.now()
    startTime = performance.timeOrigin + start
  }

  function stopTimer() {
    duration = performance.timeOrigin + performance.now() - startTime
  }

  function getDuration() {
    return duration ? duration : 0
  }

  function getStartTime() {
    return startTime
  }

  return { startTimer, stopTimer, getDuration, getStartTime }
}
