export function setPageVisibility(visibility: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get() {
      return visibility
    },
  })
}

export function restorePageVisibility() {
  delete (document as any).visibilityState
}
