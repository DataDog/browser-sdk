afterEach(() => {
  cleanupRRWebReferencesFromNodes()
})

function cleanupRRWebReferencesFromNodes(node: Node = document.documentElement) {
  delete (node as any).__sn
  delete (node as any).__ln
  for (let i = 0; i < node.childNodes.length; i += 1) {
    cleanupRRWebReferencesFromNodes(node.childNodes[i])
  }
}
