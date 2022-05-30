export function createIsolatedDOM() {
  // Simply using a DOMParser does not fit here, because script tags created this way are
  // considered as normal markup, so they are not ignored when getting the textual content of the
  // target via innerText
  const iframe = document.createElement('iframe')
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument!
  doc.open()
  doc.write('<html><body></body></html>')
  doc.close()

  return {
    element(s: TemplateStringsArray) {
      iframe.contentDocument!.body.innerHTML = s[0]
      return doc.querySelector('[target]') || doc.body.children[0]
    },
    clear() {
      iframe.parentNode!.removeChild(iframe)
    },
  }
}
