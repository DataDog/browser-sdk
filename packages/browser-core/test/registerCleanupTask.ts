import { afterEach } from 'vitest'

type CleanupTask = () => unknown

const cleanupTasks: CleanupTask[] = []

export function registerCleanupTask(task: CleanupTask) {
  cleanupTasks.unshift(task)
}

afterEach(async () => {
  for (const task of cleanupTasks.splice(0)) {
    try {
      await task()
    } catch (error) {
      const cleanupError = new Error(`Cleanup task failed: ${String(error)}`) as Error & { cause?: unknown }
      cleanupError.cause = error
      throw cleanupError
    }
  }
})
