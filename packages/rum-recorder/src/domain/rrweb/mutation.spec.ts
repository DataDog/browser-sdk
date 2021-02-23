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
  recordCanvas: false,
  maskInputOptions: {},
}

describe('MutationObserverWrapper', () => {
  let sandbox: HTMLElement
  let mutationCallbackSpy: jasmine.Spy<MutationCallBack>
  let mutationController: MutationController

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    sandbox = document.createElement('div')
    sandbox.appendChild(document.createElement('div'))
    mutationCallbackSpy = jasmine.createSpy<MutationCallBack>()
    mutationController = new MutationController()
    MockMutationObserver.setup()

    new MutationObserverWrapper(
      mutationController,
      mutationCallbackSpy,
      DEFAULT_OPTIONS.inlineStylesheet,
      DEFAULT_OPTIONS.maskInputOptions,
      DEFAULT_OPTIONS.recordCanvas,
      DEFAULT_OPTIONS.slimDOMOptions
    )
  })

  afterEach(() => {
    MockMutationObserver.cleanup()
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
  static instances: MockMutationObserver[] = []
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
    this.instances.forEach((instance) => instance.callback(records))
  }

  static storeRecords(records: MutationRecord[]) {
    this.instances.forEach((instance) => instance.storedRecords.push(...records))
  }

  observe() {
    MockMutationObserver.instances.push(this)
  }

  disconnect() {
    MockMutationObserver.instances = MockMutationObserver.instances.filter((other) => other !== this)
  }

  takeRecords() {
    return this.storedRecords.splice(0, this.storedRecords.length)
  }
}
