import { isIE } from '@datadog/browser-core'
import { serializeNodeWithId, SerializedNodeWithId, IdNodeMap } from '../rrweb-snapshot'
import { MutationBuffer } from './mutation'
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

describe('MutationBuffer', () => {
  let sandbox: HTMLElement
  let mutationBuffer: MutationBuffer
  let mutationCallbackSpy: jasmine.Spy<MutationCallBack>

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    sandbox = document.createElement('div')
    sandbox.appendChild(document.createElement('div'))
    mutationCallbackSpy = jasmine.createSpy<MutationCallBack>()
    mutationBuffer = new MutationBuffer()
    mutationBuffer.init(
      mutationCallbackSpy,
      DEFAULT_OPTIONS.blockClass,
      DEFAULT_OPTIONS.blockSelector,
      DEFAULT_OPTIONS.inlineStylesheet,
      DEFAULT_OPTIONS.maskInputOptions,
      DEFAULT_OPTIONS.recordCanvas,
      DEFAULT_OPTIONS.slimDOMOptions
    )
  })

  afterEach(() => {
    sandbox.remove()
  })

  it('generates a mutation when a node is appended to a known node', () => {
    addNodeToMap(sandbox, {})

    mutationBuffer.processMutations([
      {
        type: 'childList',
        target: sandbox,
        addedNodes: createNodeList([sandbox.firstChild!]),
        removedNodes: createNodeList([]),
        oldValue: null,
        attributeName: null,
      },
    ])

    expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)
    expect(mutationCallbackSpy).toHaveBeenCalledWith({
      texts: [],
      attributes: [],
      removes: [],
      adds: [
        {
          parentId: 1,
          nextId: null,
          node: (jasmine.objectContaining({
            tagName: 'div',
          }) as unknown) as SerializedNodeWithId,
        },
      ],
    })
  })

  it('does not generate a mutation when a node is appended to a unknown node', () => {
    mutationBuffer.processMutations([
      {
        type: 'childList',
        target: sandbox,
        addedNodes: createNodeList([sandbox.firstChild!]),
        removedNodes: createNodeList([]),
        oldValue: null,
        attributeName: null,
      },
    ])
    expect(mutationCallbackSpy).not.toHaveBeenCalled()
  })
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
