import { isIE } from '@datadog/browser-core'
import {
  isTextNode,
  isCommentNode,
  isElementNode,
  isNodeShadowRoot,
  getChildNodes,
  getParentNode,
  isNodeShadowHost,
} from './htmlDomUtils'

describe('isTextNode', () => {
  const parameters: Array<[Node, boolean]> = [
    [document.createTextNode('hello'), true],
    [document.createElement('div'), false],
    [document.body, false],
    [document.createComment('hello'), false],
    ['hello' as unknown as Node, false],
  ]

  parameters.forEach(([element, result]) => {
    it(`should return ${String(result)} for "${String(element)}"`, () => {
      expect(isTextNode(element)).toBe(result)
    })
  })
})

describe('isCommentNode', () => {
  const parameters: Array<[Node, boolean]> = [
    [document.createComment('hello'), true],
    [document.createTextNode('hello'), false],
    [document.createElement('div'), false],
    [document.body, false],
    ['hello' as unknown as Node, false],
  ]

  parameters.forEach(([element, result]) => {
    it(`should return ${String(result)} for "${String(element)}"`, () => {
      expect(isCommentNode(element)).toBe(result)
    })
  })
})

describe('isElementNode', () => {
  const parameters: Array<[Node, boolean]> = [
    [document.createElement('div'), true],
    [document.body, true],
    [document.createTextNode('hello'), false],
    [document.createComment('hello'), false],
    ['hello' as unknown as Node, false],
  ]

  parameters.forEach(([element, result]) => {
    it(`should return ${String(result)} for "${String(element)}"`, () => {
      expect(isElementNode(element)).toBe(result)
    })
  })
})

describe('isShadowRoot', () => {
  if (isIE()) {
    return
  }

  const parent = document.createElement('div')
  parent.attachShadow({ mode: 'open' })
  const parameters: Array<[Node, boolean]> = [
    [parent.shadowRoot!, true],
    [parent, false],
    [document.body, false],
    [document.createTextNode('hello'), false],
    [document.createComment('hello'), false],
  ]

  parameters.forEach(([element, result]) => {
    it(`should return ${String(result)} for "${String(element)}"`, () => {
      expect(isNodeShadowRoot(element)).toBe(result)
    })
  })
})

describe('isShadowHost', () => {
  if (isIE()) {
    return
  }
  const host = document.createElement('div')
  host.attachShadow({ mode: 'open' })
  const parameters: Array<[Node, boolean]> = [
    [host, true],
    [host.shadowRoot!, false],
    [document.body, false],
    [document.createTextNode('hello'), false],
    [document.createComment('hello'), false],
  ]

  parameters.forEach(([element, result]) => {
    it(`should return ${String(result)} for "${String(element)}"`, () => {
      expect(isNodeShadowHost(element)).toBe(result)
    })
  })
})

describe('getChildNodes', () => {
  it('should return the direct children for a normal node', () => {
    if (isIE()) {
      pending('IE not supported')
    }

    const children: Node[] = [
      document.createTextNode('toto'),
      document.createElement('span'),
      document.createComment('oops'),
    ]
    const container = document.createElement('div')
    children.forEach((node) => {
      container.appendChild(node)
    })

    expect(getChildNodes(container).length).toBe(children.length)
  })

  it('should return the children of the shadow root for a node that is a host', () => {
    if (isIE()) {
      pending('IE not supported')
    }

    const children: Node[] = [
      document.createTextNode('toto'),
      document.createElement('span'),
      document.createComment('oops'),
    ]
    const container = document.createElement('div')
    container.attachShadow({ mode: 'open' })

    children.forEach((node) => {
      container.shadowRoot!.appendChild(node)
    })

    expect(getChildNodes(container).length).toBe(children.length)
  })
})

describe('getParentNode', () => {
  if (isIE()) {
    return
  }

  const orphanDiv = document.createElement('div')
  const parentWithShadowRoot = document.createElement('div')
  const shadowRoot = parentWithShadowRoot.attachShadow({ mode: 'open' })

  const parentWithoutShadowRoot = document.createElement('div')
  const child = document.createElement('span')
  parentWithoutShadowRoot.appendChild(child)

  const parameters: Array<[string, Node, Node | null]> = [
    ['return null if without parent', orphanDiv, null],
    ['return the host for a shadow root', shadowRoot, parentWithShadowRoot],
    ['return the parent for normal child', child, parentWithoutShadowRoot],
  ]
  parameters.forEach(([label, element, result]) => {
    it(`should ${label}`, () => {
      expect(getParentNode(element)).toBe(result)
    })
  })
})
