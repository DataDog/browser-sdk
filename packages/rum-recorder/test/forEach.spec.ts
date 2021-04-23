afterEach(() => {
  cleanupRRWebReferencesFromNodes()
})

function cleanupRRWebReferencesFromNodes(node: Node = document.documentElement) {
  // eslint-disable-next-line no-underscore-dangle
  delete (node as any).__sn
  // eslint-disable-next-line no-underscore-dangle
  delete (node as any).__ln
  for (let i = 0; i < node.childNodes.length; i += 1) {
    cleanupRRWebReferencesFromNodes(node.childNodes[i])
  }
}
