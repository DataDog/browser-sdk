export interface ActionNameResult {
  name: string
  nameSource: 'custom_attribute' | 'text_content' | 'standard_attribute' | 'blank'
}

const MAX_ATTRIBUTE_NAME_CHAR_COUNT = 100
const MAX_PARENTS_FOR_STRATEGIES = 10

export function getActionName(element: Element): ActionNameResult {
  // 1. Walk up DOM for data-dd-action-name (no parent limit)
  const customName = getCustomActionName(element)
  if (customName) return { name: truncate(customName), nameSource: 'custom_attribute' }

  // 2. Priority strategies (up to 10 parents from target)
  const strategyResult = applyStrategies(element)
  if (strategyResult) return { name: truncate(strategyResult.name), nameSource: strategyResult.nameSource }

  // 3. Fallback: text content
  const textContent = getElementTextContent(element)
  if (textContent) return { name: truncate(textContent), nameSource: 'text_content' }

  // 4. Final: empty string
  return { name: '', nameSource: 'blank' }
}

function getCustomActionName(element: Element): string | undefined {
  let current: Element | null = element
  while (current) {
    const name = current.getAttribute('data-dd-action-name')
    if (name) return name.trim()
    current = current.parentElement
  }
  return undefined
}

function applyStrategies(
  element: Element
): { name: string; nameSource: 'text_content' | 'standard_attribute' } | undefined {
  let current: Element | null = element
  for (let depth = 0; current && depth <= MAX_PARENTS_FOR_STRATEGIES; depth++) {
    const tag = current.tagName.toLowerCase()

    // input with labels
    if (tag === 'input' && 'labels' in current) {
      const labels = (current as HTMLInputElement).labels
      if (labels && labels.length > 0) {
        const labelText = getElementTextContent(labels[0])
        if (labelText) return { name: labelText, nameSource: 'text_content' }
      }
    }

    // input type button/submit/reset
    if (tag === 'input') {
      const type = (current as HTMLInputElement).type
      if (type === 'button' || type === 'submit' || type === 'reset') {
        const value = (current as HTMLInputElement).value
        if (value) return { name: value.trim(), nameSource: 'standard_attribute' }
      }
    }

    // button, label, role="button"
    if (tag === 'button' || tag === 'label' || current.getAttribute('role') === 'button') {
      const text = getElementTextContent(current)
      if (text) return { name: text, nameSource: 'text_content' }
    }

    // aria-label
    const ariaLabel = current.getAttribute('aria-label')
    if (ariaLabel) return { name: ariaLabel.trim(), nameSource: 'standard_attribute' }

    // aria-labelledby
    const ariaLabelledBy = current.getAttribute('aria-labelledby')
    if (ariaLabelledBy) {
      const ids = ariaLabelledBy.split(/\s+/)
      const texts = ids
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((el) => getElementTextContent(el!))
        .filter(Boolean)
      if (texts.length > 0) return { name: texts.join(' '), nameSource: 'standard_attribute' }
    }

    // alt, name, title, placeholder
    for (const attr of ['alt', 'name', 'title', 'placeholder']) {
      const value = current.getAttribute(attr)
      if (value) return { name: value.trim(), nameSource: 'standard_attribute' }
    }

    // select → first option text
    if (tag === 'select') {
      const firstOption = (current as HTMLSelectElement).options?.[0]
      if (firstOption) return { name: firstOption.text.trim(), nameSource: 'standard_attribute' }
    }

    current = current.parentElement
  }
  return undefined
}

function getElementTextContent(element: Element): string {
  const text = element.textContent || (element as HTMLElement).innerText || ''
  return normalizeWhitespace(text)
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function truncate(name: string): string {
  if (name.length <= MAX_ATTRIBUTE_NAME_CHAR_COUNT) return name
  return name.slice(0, MAX_ATTRIBUTE_NAME_CHAR_COUNT) + ' [...]'
}
