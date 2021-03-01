import { isIE } from '@datadog/browser-core'
import { serializeNodeWithId, SerializedNodeWithId, IdNodeMap } from '../rrweb-snapshot'
import { MutationObserverWrapper, MutationController } from './mutation'
import { MutationCallBack } from './types'

const DEFAULT_OPTIONS = {
  blockClass: 'dd-block',
  blockSelector: null,
  inlineStylesheet: false,
  skipChild: true,
  slimDOMOptions: {},
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

    sandbox = document.createElement('div')
    sandbox.appendChild(document.createElement('div'))
    mutationCallbackSpy = jasmine.createSpy<MutationCallBack>()
    mutationController = new MutationController()
    MockMutationObserver.setup()

    mutationObserverWrapper = new MutationObserverWrapper(
      mutationController,
      mutationCallbackSpy,
      DEFAULT_OPTIONS.inlineStylesheet,
      DEFAULT_OPTIONS.slimDOMOptions
    )
  })

  afterEach(() => {
    MockMutationObserver.cleanup()
    mutationObserverWrapper.stop()
    sandbox.remove()
  })

  it('generates a mutation when a node is appended to a known node', () => {
    addNodeToMap(sandbox, {})

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
    addNodeToMap(sandbox, {})

    MockMutationObserver.storeRecords([createMutationRecord()])
    expect(mutationCallbackSpy).toHaveBeenCalledTimes(0)
    mutationController.freeze()
    expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)
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

function addNodeToMap(node: Node, map: IdNodeMap) {
  serializeNodeWithId(node, {
    doc: document,
    map,
    ...DEFAULT_OPTIONS,
  })
}

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
