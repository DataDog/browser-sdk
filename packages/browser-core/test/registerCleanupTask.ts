import { onTestFinished } from 'vitest'

type CleanupTask = () => unknown

export function registerCleanupTask(task: CleanupTask) {
  onTestFinished(async () => {
    await task()
  })
}
