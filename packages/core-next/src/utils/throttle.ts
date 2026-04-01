function throttle<T extends (...args: any[]) => void>(
  fn: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean }
): { throttled: (...args: Parameters<T>) => void; cancel: () => void } {
  const leading = options?.leading ?? true
  const trailing = options?.trailing ?? true
  let inWaitPeriod = false
  let pendingArgs: Parameters<T> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function execute(args: Parameters<T>) {
    fn(...args)
    inWaitPeriod = true
    pendingArgs = undefined
    timer = setTimeout(() => {
      inWaitPeriod = false
      if (trailing && pendingArgs) {
        execute(pendingArgs)
      }
    }, wait)
  }

  return {
    throttled: (...args: Parameters<T>) => {
      if (inWaitPeriod) {
        pendingArgs = args
        return
      }
      if (leading) {
        execute(args)
      } else {
        pendingArgs = args
        inWaitPeriod = true
        timer = setTimeout(() => {
          inWaitPeriod = false
          if (trailing && pendingArgs) {
            execute(pendingArgs)
          }
        }, wait)
      }
    },
    cancel: () => {
      clearTimeout(timer)
      inWaitPeriod = false
      pendingArgs = undefined
    },
  }
}

export { throttle }
