type CleanupTask = () => unknown

const cleanupTasks: CleanupTask[] = []

export function registerCleanupTask(task: CleanupTask) {
  cleanupTasks.unshift(task)
}

afterEach(async () => {
  for (const task of cleanupTasks.splice(0)) {
    await task()
  }
})
