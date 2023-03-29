export function setNavigatorOnLine(onLine: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    get() {
      return onLine
    },
    configurable: true,
  })
}

export function restoreNavigatorOnLine() {
  delete (navigator as any).onLine
}
