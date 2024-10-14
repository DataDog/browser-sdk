import { ONE_SECOND } from './utils/timeUtils'
import { requestIdleCallback } from './requestIdleCallback'

/**
 * Maximum amount of time to delay the tasks. We don't want to wait too long before running tasks,
 * as it might hurt reliability (ex: if the user navigates away, we might lose the opportunity to
 * send some data). We also don't want to run tasks too often, as it might hurt performance.
 */
const IDLE_CALLBACK_TIMEOUT = ONE_SECOND

/**
 * Minimum amount of time to run the task when a timeout is reached. We should not run tasks for
 * too long as it will hurt performance, but we should still run some tasks to avoid postponing them
 * forever.
 *
 * Rational: Running tasks for 30ms every second (IDLE_CALLBACK_TIMEOUT) should be acceptable.
 */
export const TIMED_OUT_TIME_REMAINING = 30

export interface TaskQueue {
  push(task: Task): void
}

type Task = () => void

export function createTaskQueue(): TaskQueue {
  const pendingTasks: Task[] = []

  function run(deadline: IdleDeadline) {
    let timeRemaining: () => number
    if (deadline.didTimeout) {
      const start = performance.now()
      timeRemaining = () => TIMED_OUT_TIME_REMAINING - (performance.now() - start)
    } else {
      timeRemaining = deadline.timeRemaining.bind(deadline)
    }

    while (timeRemaining() > 0 && pendingTasks.length) {
      pendingTasks.shift()!()
    }

    if (pendingTasks.length) {
      scheduleNextRun()
    }
  }

  function scheduleNextRun() {
    requestIdleCallback(run, { timeout: IDLE_CALLBACK_TIMEOUT })
  }

  return {
    push(task) {
      if (pendingTasks.push(task) === 1) {
        scheduleNextRun()
      }
    },
  }
}
