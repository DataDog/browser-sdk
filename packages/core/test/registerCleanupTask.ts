const cleanupTasks: Array<() => void> = []

export function registerCleanupTask(task: () => void) {
  cleanupTasks.push(task)
}

afterEach(() => {
  cleanupTasks
    .splice(0)
    .reverse()
    .forEach((task) => task())
})
