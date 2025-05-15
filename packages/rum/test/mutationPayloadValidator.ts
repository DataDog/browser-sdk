import { getGlobalObject } from '@flashcatcloud/browser-core'
import { NodeType, IncrementalSource } from '../src/types'
import type {
  SerializedNodeWithId,
  ElementNode,
  TextNode,
  DocumentFragmentNode,
  SerializedNode,
  BrowserMutationPayload,
  BrowserSegment,
  BrowserMutationData,
} from '../src/types'
import { findAllIncrementalSnapshots, findFullSnapshot } from './segments'
import { findTextNode, findElementWithTagName, findElementWithIdAttribute } from './nodes'

// Should match both jasmine and playwright 'expect' functions
type Expect = (actual: any) => { toEqual(expected: any): void }

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
  function expectNewNode(node: Partial<DocumentFragmentNode>): ExpectedNode
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
    validate: (
      payload: BrowserMutationPayload,
      expected: ExpectedMutationsPayload,
      { expect = getGlobalObject<{ expect: Expect }>().expect }: { expect?: Expect } = {}
    ) => {
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
export function createMutationPayloadValidatorFromSegment(segment: BrowserSegment, options?: { expect?: Expect }) {
  const fullSnapshot = findFullSnapshot(segment)!
  if (!fullSnapshot) {
    throw new Error('Full snapshot not found')
  }

  const mutations = findAllIncrementalSnapshots(segment, IncrementalSource.Mutation) as Array<{
    data: BrowserMutationData
  }>
  if (mutations.length !== 1) {
    throw new Error(`Expected 1 mutation, found ${mutations.length}`)
  }

  const mutationPayloadValidator = createMutationPayloadValidator(fullSnapshot.data.node)
  return {
    ...mutationPayloadValidator,
    validate: (expected: ExpectedMutationsPayload) =>
      mutationPayloadValidator.validate(mutations[0].data, expected, options),
  }
}
