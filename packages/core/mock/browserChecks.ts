export function isFirefox() {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1
}

export function isAdoptedStyleSheetsSupported() {
  return Boolean((document as any).adoptedStyleSheets)
}
