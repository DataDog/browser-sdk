import { arrayFrom } from '@datadog/browser-core'

export function getSelectorFromElement(targetElement: Element): string {
  const targetElementSelector = []
  let element: Element | null = targetElement

  while (element && element.nodeName !== 'HTML') {
    const idSelector = getIDSelector(element)
    if (idSelector) {
      targetElementSelector.unshift(idSelector)
      break
    }

    targetElementSelector.unshift(getClassSelector(element) || getPositionSelector(element))

    element = element.parentElement
  }

  return targetElementSelector.join('>')
}

function getIDSelector(element: Element): string | undefined {
  const isUnique = element.id && element.ownerDocument.body.querySelectorAll(`#${element.id}`).length === 1

  if (isUnique) return `#${element.id}`
}

function getClassSelector(element: Element): string | undefined {
  const orderedClassList = arrayFrom(element.classList).sort()
  const siblings = arrayFrom(element.parentElement!.children).filter((child) => child !== element)
  const classUniqueAmongSiblings = siblings.every(
    (sibling) =>
      sibling.tagName !== element.tagName ||
      orderedClassList.some((className) => !sibling.classList.contains(className))
  )

  if (classUniqueAmongSiblings)
    return `${element.tagName}${orderedClassList.map((className) => `.${className}`).join('')}`
}

function getPositionSelector(element: Element): string | undefined {
  const isUniqueChild = !element.previousElementSibling && !element.nextElementSibling
  if (isUniqueChild) return `${element.tagName}`

  const index = arrayFrom(element.parentElement!.children).indexOf(element)
  return `${element.tagName}:nth-of-type(${index + 1})`
}
