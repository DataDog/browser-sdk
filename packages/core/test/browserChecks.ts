export function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

export function isFirefox() {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1
}

export function isAdoptedStyleSheetsSupported() {
  return Boolean((document as any).adoptedStyleSheets)
}
