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

  const classes = (element.getAttribute('class') || '').trim()
  return classes ? classes.split(/\s+/) : []
}
