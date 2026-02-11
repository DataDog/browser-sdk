import type {
  BrowserFullSnapshotRecord,
  BrowserIncrementalSnapshotRecord,
  BrowserMutationPayload,
  SerializedNodeWithId,
} from '../../../../types'
import { IncrementalSource, RecordType } from '../../../../types'
import type { NodeId } from '../../itemIds'
import { createV1RenderOptions } from './renderOptions'
import type { VDocument } from './vDocument'
import type { VNode, VNodeState } from './vNode'

export function expectConnections(
  node: VNode,
  connections: {
    state?: VNodeState | undefined
    firstChild?: VNode | undefined
    lastChild?: VNode | undefined
    previousSibling?: VNode | undefined
    nextSibling?: VNode | undefined
    parent?: VNode | undefined
  }
): void {
  expect(node.state).toBe(connections.state ?? 'connected')
  expect(node.firstChild).toBe(connections.firstChild)
  expect(node.lastChild).toBe(connections.lastChild)
  expect(node.previousSibling).toBe(connections.previousSibling)
  expect(node.nextSibling).toBe(connections.nextSibling)
  expect(node.parent).toBe(connections.parent)
}

export function expectMutations(
  document: VDocument,
  mutations: {
    attributeChanges?: Array<{ node: VNode; attributes: string[] }>
    nodeAdds?: VNode[]
    nodeRemoves?: Array<{ node: VNode; parent: VNode }>
    textChanges?: VNode[]
  }
): void {
  const expectedAttributeChanges: Array<{ node: NodeId; attributes: string[] }> =
    mutations.attributeChanges?.map(({ node, attributes }) => ({ node: node.id, attributes })) ?? []
  const actualAttributeChanges: Array<{ node: NodeId; attributes: string[] }> = [
    ...document.mutations.attributeChanges,
  ].map(([nodeId, attributes]) => ({ node: nodeId, attributes: [...attributes] }))
  expect(actualAttributeChanges).toEqual(expectedAttributeChanges)

  const expectedNodeAdds: NodeId[] = mutations.nodeAdds?.map((node) => node.id) ?? []
  const actualNodeAdds: NodeId[] = [...document.mutations.nodeAdds]
  expect(actualNodeAdds).toEqual(expectedNodeAdds)

  const expectedNodeRemoves: Array<{ node: NodeId; parent: NodeId }> =
    mutations.nodeRemoves?.map(({ node, parent }) => ({ node: node.id, parent: parent.id })) ?? []
  const actualNodeRemoves: Array<{ node: NodeId; parent: NodeId }> = [...document.mutations.nodeRemoves].map(
    ([node, parent]) => ({ node, parent })
  )
  expect(actualNodeRemoves).toEqual(expectedNodeRemoves)

  const expectedTextChanges: NodeId[] = mutations.textChanges?.map((node) => node.id) ?? []
  const actualTextChanges: NodeId[] = [...document.mutations.textChanges]
  expect(actualTextChanges).toEqual(expectedTextChanges)
}

export function expectFullSnapshotRendering(
  document: VDocument,
  data: BrowserFullSnapshotRecord['data'],
  naturalRendering:
    | BrowserFullSnapshotRecord['type']
    | BrowserIncrementalSnapshotRecord['type'] = RecordType.FullSnapshot
): void {
  expect(document.naturalRendering()).toBe(naturalRendering)

  const expectedRecord: BrowserFullSnapshotRecord = {
    data,
    type: RecordType.FullSnapshot,
    timestamp: 0,
  }
  const actualRecord = document.renderAsFullSnaphot()
  expect(actualRecord).toEqual(expectedRecord)

  const expectedSerialization = JSON.stringify(expectedRecord)
  const actualSerialization = JSON.stringify(actualRecord)
  const context = stringMismatchContext(expectedSerialization, actualSerialization)
  expect(actualSerialization).withContext(context).toBe(expectedSerialization)
}

export function expectIncrementalSnapshotRendering(
  document: VDocument,
  incrementalSnapshotPayload: BrowserMutationPayload,
  fullSnapshotData: BrowserFullSnapshotRecord['data']
): void {
  expect(document.naturalRendering()).toBe(RecordType.IncrementalSnapshot)

  const expectedRecord: BrowserIncrementalSnapshotRecord = {
    data: {
      source: IncrementalSource.Mutation,
      ...incrementalSnapshotPayload,
    },
    type: RecordType.IncrementalSnapshot,
    timestamp: 0,
  }
  const actualRecord = document.render()
  expect(actualRecord).toEqual(expectedRecord)

  const expectedSerialization = JSON.stringify(expectedRecord)
  const actualSerialization = JSON.stringify(actualRecord)
  const context = stringMismatchContext(expectedSerialization, actualSerialization)
  expect(actualSerialization).withContext(context).toBe(expectedSerialization)

  expectFullSnapshotRendering(document, fullSnapshotData, RecordType.IncrementalSnapshot)
}

export function expectNodeRendering(node: VNode, expectedSerializedNode: SerializedNodeWithId): void {
  const actualSerializedNode = node.render(createV1RenderOptions())
  expect(actualSerializedNode).toEqual(expectedSerializedNode)

  const expectedSerialization = JSON.stringify(expectedSerializedNode)
  const actualSerialization = JSON.stringify(actualSerializedNode)
  const context = stringMismatchContext(expectedSerialization, actualSerialization)
  expect(actualSerialization).withContext(context).toBe(expectedSerialization)
}

function stringMismatchContext(expected: string, actual: string): string {
  if (expected === actual) {
    return '(equal)'
  }

  let firstDifferenceIndex = 0
  while (expected[firstDifferenceIndex] === actual[firstDifferenceIndex]) {
    firstDifferenceIndex++
  }

  const expectedContext = getStringNearPosition(expected, firstDifferenceIndex)
  const actualContext = getStringNearPosition(actual, firstDifferenceIndex)
  return JSON.stringify({ expected: expectedContext, actual: actualContext }, null, 2)
}

function getStringNearPosition(str: string, index: number): string {
  const leftContextStart = Math.max(index - 50, 0)
  const rightContextEnd = Math.min(index + 150, str.length)
  return `${str.substring(leftContextStart, index)}(!)${str.substring(index, rightContextEnd)}`
}
