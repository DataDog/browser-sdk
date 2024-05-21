// https://github.com/jquery/jquery/blob/a684e6ba836f7c553968d7d026ed7941e1a612d8/src/selector/escapeSelector.js
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

export function elementMatches(element: Element & { msMatchesSelector?(selector: string): boolean }, selector: string) {
  if (element.matches) {
    return element.matches(selector)
  }
  // IE11 support
  if (element.msMatchesSelector) {
    return element.msMatchesSelector(selector)
  }
  return false
}

/**
 * Return the parentElement of an node
 *
 * In cases where parentElement is not supported, such as in IE11 for SVG nodes, we fallback to parentNode
 */
export function getParentElement(node: Node): HTMLElement | null {
  if (node.parentElement) {
    return node.parentElement
  }

  while (node.parentNode) {
    if (node.parentNode.nodeType === Node.ELEMENT_NODE) {
      return node.parentNode as HTMLElement
    }
    node = node.parentNode
  }

  return null
}

/**
 * Return the classList of an element or an array of classes if classList is not supported
 *
 * In cases where classList is not supported, such as in IE11 for SVG and MathML elements,
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

// ie11 supports WeakMap but not WeakSet
const PLACEHOLDER = 1
export class WeakSet<T extends object> {
  private map = new WeakMap<T, typeof PLACEHOLDER>()

  constructor(initialValues?: T[]) {
    if (initialValues) {
      initialValues.forEach((value) => this.map.set(value, PLACEHOLDER))
    }
  }

  add(value: T) {
    this.map.set(value, PLACEHOLDER)

    return this
  }

  delete(value: T) {
    return this.map.delete(value)
  }

  has(value: T) {
    return this.map.has(value)
  }
}
