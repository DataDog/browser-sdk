import { arrayFrom } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'

export function appendText(text: string, container: Element | ShadowRoot = document.body): Text {
  const textNode = document.createTextNode(text)
  container.appendChild(textNode)

  registerCleanupTask(() => {
    container.removeChild(textNode)
  })

  return textNode
}

export function appendElement(html: string, container: Element | ShadowRoot = document.body): HTMLElement {
  const tmp = document.createElement('div')
  tmp.innerHTML = html.trim()

  const target = tmp.querySelector('[target]') || tmp.childNodes[0]
  const nodes = arrayFrom(tmp.childNodes)

  nodes.forEach((node) => container.appendChild(node))

  registerCleanupTask(() => {
    nodes.forEach((node) => node.parentElement?.removeChild(node))
  })

  return target as HTMLElement
}
