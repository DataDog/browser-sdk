const cleanupTasks: Array<() => void> = []

export function registerCleanupTask(task: () => void) {
  if (typeof globalThis['afterEach'] !== 'function') {
    throw new Error('Not inside a Jasmine test')
  }
  cleanupTasks.unshift(task)
}

if (typeof globalThis['afterEach'] === 'function') {
  afterEach(() => {
    cleanupTasks.splice(0).forEach((task) => task())
  })
}
