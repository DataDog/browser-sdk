export function getActionNameFromElement(element: Element): string {
  return (
    getActionNameFromElementForGetters(element, priorityGetters) ||
    getActionNameFromElementForGetters(element, fallbackGetters) ||
    ''
  )
}

type NameGetter = (element: Element | HTMLElement | HTMLInputElement | HTMLSelectElement) => string | undefined | null

const priorityGetters: NameGetter[] = [
  // associated LABEL text
  (element) => {
    // IE does not support element.labels, so we fallback to a CSS selector based on the element id
    // instead
    if (supportsLabelProperty()) {
      if ('labels' in element && element.labels && element.labels.length > 0) {
        return getTextualContent(element.labels[0])
      }
    } else if (element.id) {
      const label =
        element.ownerDocument && element.ownerDocument.querySelector(`label[for="${element.id.replace('"', '\\"')}"]`)
      return label && getTextualContent(label)
    }
  },
  // INPUT button (and associated) value
  (element) => {
    if (element.nodeName === 'INPUT') {
      const input = element as HTMLInputElement
      const type = input.getAttribute('type')
      if (type === 'button' || type === 'submit' || type === 'reset') {
        return input.value
      }
    }
  },
  // BUTTON, LABEL or button-like element text
  (element) => {
    if (element.nodeName === 'BUTTON' || element.nodeName === 'LABEL' || element.getAttribute('role') === 'button') {
      return getTextualContent(element)
    }
  },
  // aria-label attribute value
  (element) => element.getAttribute('aria-label'),
  // associated element text designated by the aria-labelledby attribute
  (element) => {
    const labelledByAttribute = element.getAttribute('aria-labelledby')
    if (labelledByAttribute) {
      return labelledByAttribute
        .split(/\s+/)
        .map((id) => getElementById(element, id))
        .filter((label): label is HTMLElement => Boolean(label))
        .map(getTextualContent)
        .join(' ')
    }
  },
  // alt attribute value
  (element) => element.getAttribute('alt'),
  // name attribute value
  (element) => element.getAttribute('name'),
  // title attribute value
  (element) => element.getAttribute('title'),
  // placeholder attribute value
  (element) => element.getAttribute('placeholder'),
  // SELECT first OPTION text
  (element) => {
    if ('options' in element && element.options.length > 0) {
      return getTextualContent(element.options[0])
    }
  },
]

const fallbackGetters: NameGetter[] = [
  // element text
  (element) => {
    return getTextualContent(element)
  },
]

function getActionNameFromElementForGetters(targetElement: Element, getters: NameGetter[]) {
  let element: Element | null = targetElement
  let recursionCounter = 0
  while (
    recursionCounter <= 10 &&
    element &&
    element.nodeName !== 'BODY' &&
    element.nodeName !== 'HTML' &&
    element.nodeName !== 'HEAD'
  ) {
    for (const getter of getters) {
      const name = getter(element)
      if (typeof name === 'string') {
        const trimedName = name.trim()
        if (trimedName) {
          return truncate(normalizeWhitespace(trimedName))
        }
      }
    }
    // Don't consider parents of FORM elements
    if (element.nodeName === 'FORM') {
      break
    }
    element = element.parentElement
    recursionCounter += 1
  }
}

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, ' ')
}

function truncate(s: string) {
  return s.length > 100 ? `${s.slice(0, 100)} [...]` : s
}

function getElementById(refElement: Element, id: string) {
  // tslint:disable-next-line: no-null-keyword
  return refElement.ownerDocument ? refElement.ownerDocument.getElementById(id) : null
}

function getTextualContent(element: Element | HTMLElement) {
  if ((element as HTMLElement).isContentEditable) {
    return
  }

  if ('innerText' in element) {
    let text = element.innerText
    if (!supportsInnerTextScriptAndStyleRemoval()) {
      // remove the inner text of SCRIPT and STYLES from the result. This is a bit dirty, but should
      // be relatively fast and work in most cases.
      const elementsToRemove: NodeListOf<HTMLElement> = element.querySelectorAll('script, style')
      // tslint:disable-next-line: prefer-for-of
      for (let i = 0; i < elementsToRemove.length; i += 1) {
        const innerText = elementsToRemove[i].innerText
        if (innerText.trim().length > 0) {
          text = text.replace(innerText, '')
        }
      }
    }
    return text
  }

  return element.textContent
}

/**
 * Returns true if element.innerText excludes the text from inline SCRIPT and STYLE element.  This
 * should be the case everywhere except on some version of Internet Explorer.
 * See http://perfectionkills.com/the-poor-misunderstood-innerText/#diff-with-textContent
 */
let supportsInnerTextScriptAndStyleRemovalResult: boolean | undefined
function supportsInnerTextScriptAndStyleRemoval() {
  if (supportsInnerTextScriptAndStyleRemovalResult === undefined) {
    const style = document.createElement('style')
    style.textContent = '*'
    const div = document.createElement('div')
    div.appendChild(style)
    document.body.appendChild(div)
    supportsInnerTextScriptAndStyleRemovalResult = div.innerText === ''
    document.body.removeChild(div)
  }
  return supportsInnerTextScriptAndStyleRemovalResult
}

/**
 * Returns true if the browser supports the element.labels property.  This should be the case
 * everywhere except on Internet Explorer.
 * Note: The result is computed lazily, because we don't want any DOM access when the SDK is
 * evaluated.
 */
let supportsLabelPropertyResult: boolean | undefined
function supportsLabelProperty() {
  if (supportsLabelPropertyResult === undefined) {
    supportsLabelPropertyResult = 'labels' in HTMLInputElement.prototype
  }
  return supportsLabelPropertyResult
}
