const cleanupTasks: Array<() => void> = []

export function registerCleanupTask(task: () => void) {
  cleanupTasks.unshift(task)
}

afterEach(() => {
  cleanupTasks.splice(0).forEach((task) => task())
})
