import { registerCleanupTask } from '@datadog/browser-core/test'

export type IsolatedDom = ReturnType<typeof createIsolatedDom>

export function createIsolatedDom() {
  // Simply using a DOMParser does not fit here, because script tags created this way are
  // considered as normal markup, so they are not ignored when getting the textual content of the
  // target via innerText
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write('<html><body></body></html>')
  doc.close()

  function append(html: string) {
    iframe.contentDocument!.body.innerHTML = html
    return doc.querySelector('[target]') || doc.body.children[0]
  }

  return {
    element(s: TemplateStringsArray) {
      return append(s[0])
    },
    document: doc,
    window: iframe.contentWindow! as Window & { CSSStyleSheet: typeof CSSStyleSheet },
    append,
    clear() {
      iframe.parentNode!.removeChild(iframe)
    },
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
