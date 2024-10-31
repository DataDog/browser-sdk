import { ONE_SECOND } from './utils/timeUtils'
import { requestIdleCallback } from './requestIdleCallback'

/**
 * Maximum delay before starting to execute tasks in the queue. We don't want to wait too long
 * before running tasks, as it might hurt reliability (ex: if the user navigates away, we might lose
 * the opportunity to send some data). We also don't want to run tasks too often, as it might hurt
 * performance.
 */
const IDLE_CALLBACK_TIMEOUT = ONE_SECOND

/**
 * Maximum amount of time allocated to running tasks when a timeout (`IDLE_CALLBACK_TIMEOUT`) is
 * reached. We should not run tasks for too long as it will hurt performance, but we should still
 * run some tasks to avoid postponing them forever.
 *
 * Rational: Running tasks for 30ms every second (IDLE_CALLBACK_TIMEOUT) should be acceptable.
 */
export const MAX_EXECUTION_TIME_ON_TIMEOUT = 30

export interface TaskQueue {
  push(task: Task): void
}

type Task = () => void

export function createTaskQueue(): TaskQueue {
  const pendingTasks: Task[] = []

  function run(deadline: IdleDeadline) {
    let executionTimeRemaining: () => number
    if (deadline.didTimeout) {
      const start = performance.now()
      executionTimeRemaining = () => MAX_EXECUTION_TIME_ON_TIMEOUT - (performance.now() - start)
    } else {
      executionTimeRemaining = deadline.timeRemaining.bind(deadline)
    }

    while (executionTimeRemaining() > 0 && pendingTasks.length) {
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
