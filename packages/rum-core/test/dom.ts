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

export function append(html: string) {
  return createIsolatedDom().append(html)
}
