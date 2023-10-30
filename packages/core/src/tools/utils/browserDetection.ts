// Exported only for tests
export const enum Browser {
  IE,
  CHROMIUM,
  SAFARI,
  OTHER,
}

export function isIE() {
  return detectBrowserCached() === Browser.IE
}

export function isChromium() {
  return detectBrowserCached() === Browser.CHROMIUM
}

export function isSafari() {
  return detectBrowserCached() === Browser.SAFARI
}

let browserCache: Browser | undefined
function detectBrowserCached() {
  return browserCache ?? (browserCache = detectBrowser())
}

// Exported only for tests
export function detectBrowser(browserWindow: Window = window) {
  const userAgent = browserWindow.navigator.userAgent
  if ((browserWindow as any).chrome || /HeadlessChrome/.test(userAgent)) {
    return Browser.CHROMIUM
  }

  if (
    (/safari/i.test(userAgent) && !/chrome|android/i.test(userAgent)) ||
    browserWindow.navigator.vendor?.indexOf('Apple') === 0
  ) {
    return Browser.SAFARI
  }

  if ((browserWindow.document as any).documentMode) {
    return Browser.IE
  }

  return Browser.OTHER
}
