import { isIE } from '@datadog/browser-core'
import { serializeNodeWithId, SerializedNodeWithId } from '../rrweb-snapshot'
import { MutationObserverWrapper, MutationController } from './mutation'
import { MutationCallBack } from './types'

const DEFAULT_OPTIONS = {
  doc: document,
  blockClass: 'dd-block',
  blockSelector: null,
  skipChild: true,
}

describe('MutationObserverWrapper', () => {
  let sandbox: HTMLElement
  let mutationCallbackSpy: jasmine.Spy<MutationCallBack>
  let mutationController: MutationController
  let mutationObserverWrapper: MutationObserverWrapper

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    // Mutation processing expects to happen after the whole document has been serialized first
    // (during a FullSnapshot).
    serializeNodeWithId(document, { ...DEFAULT_OPTIONS, skipChild: false })

    sandbox = document.createElement('div')
    sandbox.appendChild(document.createElement('div'))
    document.body.appendChild(sandbox)

    mutationCallbackSpy = jasmine.createSpy<MutationCallBack>()
    mutationController = new MutationController()
    MockMutationObserver.setup()

    mutationObserverWrapper = new MutationObserverWrapper(mutationController, mutationCallbackSpy)
  })

  afterEach(() => {
    MockMutationObserver.cleanup()
    mutationObserverWrapper.stop()
    sandbox.remove()
  })

  it('generates a mutation when a node is appended to a known node', () => {
    serializeNodeWithId(sandbox, DEFAULT_OPTIONS)

    MockMutationObserver.emitRecords([createMutationRecord()])

    expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)
    expect(mutationCallbackSpy).toHaveBeenCalledWith({
      texts: [],
      attributes: [],
      removes: [],
      adds: [
        {
          parentId: (jasmine.any(Number) as unknown) as number,
          nextId: null,
          node: (jasmine.objectContaining({
            tagName: 'div',
          }) as unknown) as SerializedNodeWithId,
        },
      ],
    })
  })

  it('does not generate a mutation when a node is appended to a unknown node', () => {
    MockMutationObserver.emitRecords([createMutationRecord()])
    expect(mutationCallbackSpy).not.toHaveBeenCalled()
  })

  it('emits buffered mutation records on freeze', () => {
    serializeNodeWithId(sandbox, DEFAULT_OPTIONS)

    MockMutationObserver.storeRecords([createMutationRecord()])
    expect(mutationCallbackSpy).toHaveBeenCalledTimes(0)
    mutationController.freeze()
    expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)
  })

  it('does not emit attribute changes on removed nodes', () => {
    const node = document.createElement('div')
    serializeNodeWithId(sandbox, DEFAULT_OPTIONS)
    serializeNodeWithId(node, DEFAULT_OPTIONS)
    MockMutationObserver.emitRecords([
      ({
        type: 'childList',
        target: sandbox,
        removedNodes: createNodeList([node]),
        addedNodes: createNodeList([]),
      } as unknown) as MutationRecord,
      ({
        type: 'attributes',
        target: node,
        attributeName: 'data-foo',
        oldValue: 'bar',
      } as unknown) as MutationRecord,
    ])

    expect(mutationCallbackSpy).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        attributes: [],
      })
    )
  })

  it('does not emit text changes on removed nodes', () => {
    const node = document.createElement('div')
    serializeNodeWithId(sandbox, DEFAULT_OPTIONS)
    serializeNodeWithId(node, DEFAULT_OPTIONS)
    MockMutationObserver.emitRecords([
      ({
        type: 'childList',
        target: sandbox,
        removedNodes: createNodeList([node]),
        addedNodes: createNodeList([]),
      } as unknown) as MutationRecord,
      ({
        type: 'characterData',
        target: node,
        oldValue: 'bar',
      } as unknown) as MutationRecord,
    ])

    expect(mutationCallbackSpy).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        texts: [],
      })
    )
  })

  function createMutationRecord(): MutationRecord {
    return {
      type: 'childList',
      target: sandbox,
      addedNodes: createNodeList([sandbox.firstChild!]),
      removedNodes: createNodeList([]),
      oldValue: null,
      attributeName: null,
      attributeNamespace: null,
      nextSibling: null,
      previousSibling: null,
    }
  }
})

function createNodeList(nodes: Node[]): NodeList {
  return (Object.assign(nodes.slice(), {
    item(this: Node[], index: number) {
      return this[index]
    },
  }) as unknown) as NodeList
}

class MockMutationObserver implements MutationObserver {
  static instance?: MockMutationObserver
  static originalMutationObserverDescriptor?: PropertyDescriptor
  private storedRecords: MutationRecord[] = []

  constructor(public readonly callback: (records: MutationRecord[]) => void) {}

  static setup() {
    if (!this.originalMutationObserverDescriptor) {
      this.originalMutationObserverDescriptor = Object.getOwnPropertyDescriptor(window, 'MutationObserver')
      window.MutationObserver = (this as unknown) as typeof MutationObserver
    }
  }

  static cleanup() {
    if (this.originalMutationObserverDescriptor) {
      Object.defineProperty(window, 'MutationObserver', this.originalMutationObserverDescriptor)
      this.originalMutationObserverDescriptor = undefined
    }
  }

  static emitRecords(records: MutationRecord[]) {
    this.instance?.callback(records)
  }

  static storeRecords(records: MutationRecord[]) {
    this.instance?.storedRecords.push(...records)
  }

  observe() {
    if (MockMutationObserver.instance) {
      throw new Error('Only a single MockMutationObserver can observe at a time')
    }
    MockMutationObserver.instance = this
  }

  disconnect() {
    if (MockMutationObserver.instance === this) {
      MockMutationObserver.instance = undefined
    }
  }

  takeRecords() {
    return this.storedRecords.splice(0, this.storedRecords.length)
  }
}
