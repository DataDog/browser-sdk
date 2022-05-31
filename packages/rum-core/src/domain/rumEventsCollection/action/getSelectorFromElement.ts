import { arrayFrom, cssEscape } from '@datadog/browser-core'

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
  if (!element.id) return

  const escapedId = cssEscape(element.id)
  const isUnique = element.ownerDocument.body.querySelectorAll(`#${escapedId}`).length === 1

  if (isUnique) return `#${escapedId}`
}

function getClassSelector(element: Element): string | undefined {
  const orderedClassList = arrayFrom(element.classList).sort()
  let classUniqueAmongSiblings = true
  for (let i = 0; i < element.parentElement!.children.length; i++) {
    const sibling = element.parentElement!.children[i]
    if (sibling === element) continue

    if (sibling.tagName === element.tagName && sameClasses(orderedClassList, sibling.classList)) {
      classUniqueAmongSiblings = false
      break
    }
  }

  if (classUniqueAmongSiblings)
    return `${element.tagName}${orderedClassList.map((className) => `.${cssEscape(className)}`).join('')}`
}

function sameClasses(a: string[], b: DOMTokenList): boolean {
  return a.length <= b.length && a.every((className) => b.contains(className))
}

function getPositionSelector(element: Element): string | undefined {
  const isUniqueChild = !element.previousElementSibling && !element.nextElementSibling
  if (isUniqueChild) return `${element.tagName}`

  let index = 1
  let prevSibling = element.previousElementSibling
  while (prevSibling) {
    if (element.tagName === prevSibling.tagName) index++

    prevSibling = prevSibling.previousElementSibling
  }

  return `${element.tagName}:nth-of-type(${index})`
}
