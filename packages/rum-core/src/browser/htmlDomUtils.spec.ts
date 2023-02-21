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

if (!isIE()) {
  describe('isShadowRoot', () => {
    const notShadowDomNodes: Node[] = [
      document,
      document.head,
      document.body,
      document.createElement('div'),
      document.createTextNode('hello'),
      document.createComment('hello'),
    ]

    notShadowDomNodes.forEach((element) => {
      it(`should return false for "${String(element.nodeName)}"`, () => {
        expect(isNodeShadowRoot(element)).toBe(false)
      })
    })

    it('should return true for shadow root but not its host', () => {
      const parent = document.createElement('div')
      const shadowRoot = parent.attachShadow({ mode: 'open' })
      expect(isNodeShadowRoot(parent)).toBe(false)
      expect(isNodeShadowRoot(shadowRoot)).toBe(true)
    })

    it('should return false for a[href] despite it has a host property', () => {
      const link = document.createElement('a')
      link.setAttribute('href', 'http://localhost/some/path')
      expect(link.host).toBeTruthy()
      expect(isNodeShadowRoot(link)).toBe(false)
    })

    it('should return false for a form with an input[name="host"] despite it has a host property', () => {
      const form = document.createElement('form')
      const input = document.createElement('input')
      input.setAttribute('name', 'host')
      form.appendChild(input)
      expect(isNodeShadowRoot(form)).toBe(false)
    })
  })
}

if (!isIE()) {
  describe('isShadowHost', () => {
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' })

    // Edge 18 and before doesn't support shadow dom, so `Element#shadowRoot` is undefined.
    const oldEdgeElement = document.createElement('div')
    Object.defineProperty(oldEdgeElement, 'shadowRoot', { value: undefined })

    const parameters: Array<[Node, boolean]> = [
      [host, true],
      [host.shadowRoot!, false],
      [document.body, false],
      [document.createTextNode('hello'), false],
      [document.createComment('hello'), false],
      [oldEdgeElement, false],
    ]

    parameters.forEach(([element, result]) => {
      it(`should return ${String(result)} for "${String(element)}"`, () => {
        expect(isNodeShadowHost(element)).toBe(result)
      })
    })
  })
}

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

if (!isIE()) {
  describe('getParentNode', () => {
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
}
