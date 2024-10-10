import { registerCleanupTask } from '@datadog/browser-core/test'

export function appendText(text: string, container: Element | ShadowRoot = document.body): Text {
  const textNode = document.createTextNode(text)
  container.appendChild(textNode)

  registerCleanupTask(() => {
    textNode.parentElement?.removeChild(textNode)
  })

  return textNode
}

export function appendElement(html: string, container: Element | ShadowRoot = document.body): HTMLElement {
  const tmp = document.createElement('div')
  tmp.innerHTML = html.trim()

  const target = tmp.querySelector('[target]') || tmp.children[0]
  const nodes = Array.from(tmp.childNodes)

  nodes.forEach((node) => container.appendChild(node))

  registerCleanupTask(() => {
    nodes.forEach((node) => node.parentNode?.removeChild(node))
  })

  return target as HTMLElement
}
