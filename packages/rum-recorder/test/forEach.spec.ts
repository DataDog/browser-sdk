import { INode } from '../src/domain/rrweb-snapshot/types'
import { NodeInLinkedList } from '../src/domain/rrweb/mutation'

afterEach(() => {
  cleanupRRWebReferencesFromNodes()
})

function cleanupRRWebReferencesFromNodes(node: Node = document.documentElement) {
  // eslint-disable-next-line no-underscore-dangle
  delete (node as INode).__sn
  // eslint-disable-next-line no-underscore-dangle
  delete (node as NodeInLinkedList).__ln
  for (let i = 0; i < node.childNodes.length; i += 1) {
    cleanupRRWebReferencesFromNodes(node.childNodes[i])
  }
}
