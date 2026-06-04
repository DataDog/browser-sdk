import { onTestFinished } from 'vitest'

export function registerCleanupTask(task: () => unknown) {
  onTestFinished(() => {
    task()
  })
}
