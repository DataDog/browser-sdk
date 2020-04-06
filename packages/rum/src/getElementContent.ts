function truncate(s: string) {
  return s.length > 200 ? `${s.slice(0, 200)} [...]` : s
}

const candidates: Array<(element: Element) => string | null> = [
  (element) => element.textContent,
  (element) => {
    if (element.tagName === 'INPUT') {
      const input = element as HTMLInputElement
      const type = input.getAttribute('type')
      if (type === 'button' || type === 'submit') {
        return input.value
      }
    }
    // tslint:disable-next-line no-null-keyword
    return null
  },
  (element) => element.getAttribute('aria-label'),
  (element) => element.getAttribute('alt'),
  (element) => element.getAttribute('title'),
  (element) => element.getAttribute('placeholder'),
]

export function getElementContent(element: Element): string {
  for (const candidate of candidates) {
    const content = candidate(element)
    if (typeof content === 'string') {
      const trimedContent = content.trim()
      if (trimedContent) {
        return truncate(trimedContent)
      }
    }
  }
  return element.parentElement ? getElementContent(element.parentElement) : ''
}
