// https://github.com/jquery/jquery/blob/a684e6ba836f7c553968d7d026ed7941e1a612d8/src/selector/escapeSelector.js
// Needed to support Edge < 18
export function cssEscape(str: string) {
  if (window.CSS && window.CSS.escape) {
    return window.CSS.escape(str)
  }

  // eslint-disable-next-line no-control-regex
  return str.replace(/([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g, function (ch, asCodePoint) {
    if (asCodePoint) {
      // U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
      if (ch === '\0') {
        return '\uFFFD'
      }
      // Control characters and (dependent upon position) numbers get escaped as code points
      return `${ch.slice(0, -1)}\\${ch.charCodeAt(ch.length - 1).toString(16)} `
    }
    // Other potentially-special ASCII characters get backslash-escaped
    return `\\${ch}`
  })
}

/**
 * Return the classList of an element or an array of classes if classList is not supported
 *
 * In cases where classList is not supported, such as in Opera Mini for SVG and MathML elements,
 * we fallback to using element.getAttribute('class').
 * We opt for element.getAttribute('class') over element.className because className returns an SVGAnimatedString for SVG elements.
 */
export function getClassList(element: Element): DOMTokenList | string[] {
  if (element.classList) {
    return element.classList
  }

  const classes = element.getAttribute('class')?.trim()
  return classes ? classes.split(/\s+/) : []
}
