export function isIE() {
  return Boolean((document as any).documentMode)
}

export function isChromium() {
  return !!(window as any).chrome
}
