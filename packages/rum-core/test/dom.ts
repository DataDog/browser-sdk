import { registerCleanupTask } from '@datadog/browser-core/test'

export type IsolatedDom = ReturnType<typeof createIsolatedDom>

export function createIsolatedDom() {
  function append<E extends Element>(html: string, container: HTMLElement): E {
    const tmp = document.createElement('div')
    tmp.innerHTML = html.trim()

    const target = tmp.querySelector('[target]') || tmp.childNodes[0]
    const nodes = Array.from(tmp.childNodes)

    nodes.forEach((node) => container.appendChild(node))

    registerCleanupTask(() => {
      nodes.forEach((node) => node.remove())
    })

    return target as E
  }

  return {
    element(s: TemplateStringsArray) {
      return append(s[0], document.body)
    },
    append: <E extends Element>(html: string): E => append(html, document.body),
    appendToHead: <E extends Element>(html: string): E => append<E>(html, document.head),
    clear() {},
  }
}

export function appendElement(tagName: string, attributes: { [key: string]: string }) {
  const element = document.createElement(tagName)

  for (const key in attributes) {
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      element.setAttribute(key, attributes[key])
    }
  }

  return append(element)
}

export function appendTextNode(text: string) {
  return append(document.createTextNode(text))
}

function append<T extends Node = Node>(node: T): T {
  document.body.appendChild(node)
  registerCleanupTask(() => node.parentNode!.removeChild(node))
  return node
}
