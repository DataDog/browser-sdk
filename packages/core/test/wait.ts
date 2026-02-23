export function wait(durationMs: number = 0): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}

export function waitNextMicrotask(): Promise<void> {
  return Promise.resolve()
}

export function waitAfterNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })
}
