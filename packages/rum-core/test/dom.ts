import { registerCleanupTask } from '@datadog/browser-core/test'

export function append<E extends Element>(html: string, container = document.body): E {
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
