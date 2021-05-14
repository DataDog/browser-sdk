import {
  DeflateWorker,
  DeflateWorkerAction,
  DeflateWorkerListener,
} from '../src/domain/segmentCollection/deflateWorker'
import {
  IncrementalSource,
  MutationPayload,
  MutationData,
  ElementNode,
  NodeType,
  SerializedNode,
  SerializedNodeWithId,
  TextNode,
} from '../src/domain/record/types'
import { FullSnapshotRecord, IncrementalSnapshotRecord, MetaRecord, RecordType, Segment } from '../src/types'

export class MockWorker implements DeflateWorker {
  readonly pendingMessages: DeflateWorkerAction[] = []
  private deflatedData: Uint8Array[] = []
  private listeners: DeflateWorkerListener[] = []

  addEventListener(_: 'message', listener: DeflateWorkerListener): void {
    const index = this.listeners.indexOf(listener)
    if (index < 0) {
      this.listeners.push(listener)
    }
  }

  removeEventListener(_: 'message', listener: DeflateWorkerListener): void {
    const index = this.listeners.indexOf(listener)
    if (index >= 0) {
      this.listeners.splice(index, 1)
    }
  }

  postMessage(message: DeflateWorkerAction): void {
    this.pendingMessages.push(message)
  }

  terminate(): void {
    // do nothing
  }

  get pendingData() {
    return this.pendingMessages.map((message) => message.data || '').join('')
  }

  get listenersCount() {
    return this.listeners.length
  }

  processAllMessages(): void {
    while (this.pendingMessages.length) {
      this.processNextMessage()
    }
  }

  dropNextMessage(): void {
    this.pendingMessages.shift()
  }

  processNextMessage(): void {
    const message = this.pendingMessages.shift()
    if (message) {
      // In the mock worker, for simplicity, we'll just encode the string to UTF-8 instead of deflate it.
      this.deflatedData.push(new TextEncoder().encode(message.data))

      switch (message.action) {
        case 'write':
          this.listeners.forEach((listener) =>
            listener({
              data: {
                id: message.id,
                size: uint8ArraysSize(this.deflatedData),
              },
            })
          )
          break
        case 'flush':
          this.listeners.forEach((listener) =>
            listener({
              data: {
                id: message.id,
                result: mergeUint8Arrays(this.deflatedData),
              },
            })
          )
          this.deflatedData.length = 0
      }
    }
  }
}

function uint8ArraysSize(arrays: Uint8Array[]) {
  return arrays.reduce((sum, bytes) => sum + bytes.length, 0)
}

function mergeUint8Arrays(arrays: Uint8Array[]) {
  const result = new Uint8Array(uint8ArraysSize(arrays))
  let offset = 0
  for (const bytes of arrays) {
    result.set(bytes, offset)
    offset += bytes.byteLength
  }
  return result
}

export function parseSegment(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder().decode(bytes)) as Segment
}

export function collectAsyncCalls<F extends jasmine.Func>(spy: jasmine.Spy<F>) {
  return {
    waitAsyncCalls: (expectedCallsCount: number, callback: (calls: jasmine.Calls<F>) => void) => {
      if (spy.calls.count() === expectedCallsCount) {
        callback(spy.calls)
      } else if (spy.calls.count() > expectedCallsCount) {
        fail('Unexpected extra call')
      } else {
        spy.and.callFake((() => {
          if (spy.calls.count() === expectedCallsCount) {
            callback(spy.calls)
          }
        }) as F)
      }
    },
    expectNoExtraAsyncCall: (done: () => void) => {
      spy.and.callFake((() => {
        fail('Unexpected extra call')
      }) as F)
      setTimeout(done, 300)
    },
  }
}

// Returns the first MetaRecord in a Segment, if any.
export function findMeta(segment: Segment): MetaRecord | null {
  return segment.records.find((record) => record.type === RecordType.Meta) as MetaRecord
}

// Returns the first FullSnapshotRecord in a Segment, if any.
export function findFullSnapshot(segment: Segment): FullSnapshotRecord | null {
  return segment.records.find((record) => record.type === RecordType.FullSnapshot) as FullSnapshotRecord
}

// Returns the first IncrementalSnapshotRecord of a given source in a Segment, if any.
export function findIncrementalSnapshot(segment: Segment, source: IncrementalSource): IncrementalSnapshotRecord | null {
  return segment.records.find(
    (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === source
  ) as IncrementalSnapshotRecord
}

// Returns all the IncrementalSnapshotRecord of a given source in a Segment, if any.
export function findAllIncrementalSnapshots(segment: Segment, source: IncrementalSource): IncrementalSnapshotRecord[] {
  return segment.records.filter(
    (record) => record.type === RecordType.IncrementalSnapshot && record.data.source === source
  ) as IncrementalSnapshotRecord[]
}

// Returns the textContent of a ElementNode, if any.
export function findTextContent(elem: ElementNode): string | null {
  const text = elem.childNodes.find((child) => child.type === NodeType.Text) as TextNode
  return text ? text.textContent : null
}

// Returns the first ElementNode with the given ID attribute contained in a node, if any.
export function findElementWithIdAttribute(root: SerializedNodeWithId, id: string) {
  return findElement(root, (node) => node.attributes.id === id)
}

// Returns the first ElementNode with the given tag name contained in a node, if any.
export function findElementWithTagName(root: SerializedNodeWithId, tagName: string) {
  return findElement(root, (node) => node.tagName === tagName)
}

// Returns the first TextNode with the given content contained in a node, if any.
export function findTextNode(root: SerializedNodeWithId, textContent: string) {
  return findNode(root, (node) => isTextNode(node) && node.textContent === textContent) as
    | (TextNode & { id: number })
    | null
}

// Returns the first ElementNode matching the predicate
export function findElement(root: SerializedNodeWithId, predicate: (node: ElementNode) => boolean) {
  return findNode(root, (node) => isElementNode(node) && predicate(node)) as (ElementNode & { id: number }) | null
}

// Returns the first SerializedNodeWithId matching the predicate
export function findNode(
  node: SerializedNodeWithId,
  predicate: (node: SerializedNodeWithId) => boolean
): SerializedNodeWithId | null {
  if (predicate(node)) {
    return node
  }

  if ('childNodes' in node) {
    for (const child of node.childNodes) {
      const node = findNode(child, predicate)
      if (node !== null) {
        return node
      }
    }
  }
  return null
}

function isElementNode(node: SerializedNode): node is ElementNode {
  return node.type === NodeType.Element
}

function isTextNode(node: SerializedNode): node is TextNode {
  return node.type === NodeType.Text
}

interface NodeSelector {
  // Select the first node with the given tag name from the initial full snapshot
  tag?: string
  // Select the first node with the given id attribute from the initial full snapshot
  idAttribute?: string
  // Select the first node with the given text content from the initial full snapshot
  text?: string
}

interface ExpectedTextMutation {
  // Reference to the node where the mutation happens
  node: ExpectedNode
  // New text value
  value: string
}

interface ExpectedAttributeMutation {
  // Reference to the node where the mutation happens
  node: ExpectedNode
  // Updated attributes
  attributes: {
    [key: string]: string | null
  }
}

interface ExpectedRemoveMutation {
  // Reference to the removed node
  node: ExpectedNode
  // Reference to the parent of the removed node
  parent: ExpectedNode
}

interface ExpectedAddMutation {
  // Partially check for the added node properties.
  node: ExpectedNode
  // Reference to the parent of the added node
  parent: ExpectedNode
  // Reference to the sibling of the added node
  next?: ExpectedNode
}

interface ExpectedMutationsPayload {
  texts?: ExpectedTextMutation[]
  attributes?: ExpectedAttributeMutation[]
  removes?: ExpectedRemoveMutation[]
  adds?: ExpectedAddMutation[]
}

/**
 * ExpectedNode is a helper class to build a serialized Node tree to be used to validate mutations.
 * For now, its purpose is limited to specifying child nodes.
 */
class ExpectedNode {
  constructor(private node: Omit<SerializedNodeWithId, 'childNodes'> & { childNodes?: ExpectedNode[] }) {}

  withChildren(...childNodes: ExpectedNode[]): ExpectedNode {
    return new ExpectedNode({ ...this.node, childNodes })
  }

  getId() {
    return this.node.id
  }

  toSerializedNodeWithId() {
    const { childNodes, ...result } = this.node
    if (childNodes) {
      ;(result as any).childNodes = childNodes.map((node) => node.toSerializedNodeWithId())
    }
    return result as SerializedNodeWithId
  }
}

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>

/**
 * Based on an serialized initial document, it returns:
 *
 * * a set of utilities functions to expect nodes by selecting initial nodes from the initial
 * document (expectInitialNode) or creating new nodes (expectNewNode)
 *
 * * a 'validate' function to actually validate a mutation payload against an expected mutation
 * object.
 */
export function createMutationPayloadValidator(initialDocument: SerializedNodeWithId) {
  let maxNodeId = findMaxNodeId(initialDocument)

  /**
   * Creates a new node based on input parameter, with sensible default properties, and an
   * automatically computed 'id' attribute based on the previously created nodes.
   */
  function expectNewNode(node: Optional<ElementNode, 'childNodes' | 'attributes'>): ExpectedNode
  function expectNewNode(node: TextNode): ExpectedNode
  function expectNewNode(node: Partial<SerializedNode>) {
    maxNodeId += 1
    if (node.type === NodeType.Element) {
      node.attributes ||= {}
      node.childNodes = []
    }
    return new ExpectedNode({
      ...node,
      id: maxNodeId,
    } as any)
  }

  return {
    /**
     * Validates the mutation payload against the expected text, attribute, add and remove mutations.
     */
    validate: (payload: MutationPayload, expected: ExpectedMutationsPayload) => {
      payload = removeUndefinedValues(payload)

      expect(payload.adds).toEqual(
        (expected.adds || []).map(({ node, parent, next }) => ({
          node: node.toSerializedNodeWithId(),
          parentId: parent.getId(),
          nextId: next ? next.getId() : null,
        }))
      )
      expect(payload.texts).toEqual((expected.texts || []).map(({ node, value }) => ({ id: node.getId(), value })))
      expect(payload.removes).toEqual(
        (expected.removes || []).map(({ node, parent }) => ({
          id: node.getId(),
          parentId: parent.getId(),
        }))
      )
      expect(payload.attributes).toEqual(
        (expected.attributes || []).map(({ node, attributes }) => ({
          id: node.getId(),
          attributes,
        }))
      )
    },

    expectNewNode,

    /**
     * Selects a node from the initially serialized document. Nodes can be selected via their 'tag'
     * name, 'id' attribute or 'text' content.
     */
    expectInitialNode: (selector: NodeSelector) => {
      let node
      if (selector.text) {
        node = findTextNode(initialDocument, selector.text)
      } else if (selector.idAttribute) {
        node = findElementWithIdAttribute(initialDocument, selector.idAttribute)
      } else if (selector.tag) {
        node = findElementWithTagName(initialDocument, selector.tag)
      } else {
        throw new Error('Empty selector')
      }

      if (!node) {
        throw new Error(`Cannot find node from selector ${JSON.stringify(selector)}`)
      }

      if ('childNodes' in node) {
        node = { ...node, childNodes: [] }
      }

      return new ExpectedNode(removeUndefinedValues(node))
    },
  }

  function findMaxNodeId(root: SerializedNodeWithId): number {
    if ('childNodes' in root) {
      return Math.max(root.id, ...root.childNodes.map((child) => findMaxNodeId(child)))
    }

    return root.id
  }

  /**
   * When serializing a Node, some properties like 'isSVG' may be undefined, and they are not
   * sent to the intake.
   *
   * To be able to validate mutations from E2E and Unit tests, we prefer to keep a single
   * format. Thus, we serialize and deserialize objects to drop undefined
   * properties, so they don't interferes during unit tests.
   */
  function removeUndefinedValues<T>(object: T) {
    return JSON.parse(JSON.stringify(object)) as T
  }
}

/**
 * Validate the first and only mutation record of a segment against the expected text, attribute,
 * add and remove mutations.
 */
export function createMutationPayloadValidatorFromSegment(segment: Segment) {
  const fullSnapshot = findFullSnapshot(segment)!
  expect(fullSnapshot).toBeTruthy()

  const mutations = findAllIncrementalSnapshots(segment, IncrementalSource.Mutation) as Array<{
    data: MutationData
  }>
  expect(mutations.length).toBe(1)

  const mutationPayloadValidator = createMutationPayloadValidator(fullSnapshot.data.node)
  return {
    ...mutationPayloadValidator,
    validate: (expected: ExpectedMutationsPayload) => mutationPayloadValidator.validate(mutations[0].data, expected),
  }
}
