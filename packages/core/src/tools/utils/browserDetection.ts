let browserIsIE: boolean | undefined
export function isIE() {
  return browserIsIE ?? (browserIsIE = Boolean((document as any).documentMode))
}

let browserIsChromium: boolean | undefined
export function isChromium() {
  return (
    browserIsChromium ??
    (browserIsChromium = !!(window as any).chrome || /HeadlessChrome/.test(window.navigator.userAgent))
  )
}

let browserIsSafari: boolean | undefined
export function isSafari() {
  return browserIsSafari ?? (browserIsSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent))
}
