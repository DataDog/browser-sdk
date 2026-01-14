export function wait(durationMs: number = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

export function waitNextMicrotask(): Promise<void> {
  return Promise.resolve()
}

export function waitFor<T>(
  callback: () => T | Promise<T>,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const { timeout = 1000, interval = 50 } = options

  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    function check() {
      try {
        const result = callback()
        if (result && typeof (result as any).then === 'function') {
          ;(result as Promise<T>).then(handleResult, handleError)
        } else {
          handleResult(result as T)
        }
      } catch (error) {
        handleError(error as Error)
      }
    }

    function handleResult(result: T) {
      if (result) {
        resolve(result)
      } else if (Date.now() - startTime >= timeout) {
        reject(new Error(`waitFor timed out after ${timeout}ms`))
      } else {
        setTimeout(check, interval)
      }
    }

    function handleError(error: Error) {
      if (Date.now() - startTime >= timeout) {
        reject(error)
      } else {
        setTimeout(check, interval)
      }
    }

    check()
  })
}
