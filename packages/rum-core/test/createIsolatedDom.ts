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
    append,
    clear() {
      iframe.parentNode!.removeChild(iframe)
    },
  }
}
