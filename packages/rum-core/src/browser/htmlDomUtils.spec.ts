import { isIE } from '@datadog/browser-core'
import {
  isTextNode,
  isCommentNode,
  isElementNode,
  isShadowRoot,
  getChildNodes,
  getNodeOrShadowHost,
  getParentNode,
} from './htmlDomUtils'

describe('isTextNode', () => {
  const parameters: Array<[Node, boolean]> = [
    [document.createTextNode('hello'), true],
    [document.createElement('div'), false],
    [document.body, false],
    [document.createComment('hello'), false],
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
  ]

  parameters.forEach(([element, result]) => {
    it(`should return ${String(result)} for "${String(element)}"`, () => {
      expect(isElementNode(element)).toBe(result)
    })
  })
})

describe('isShadowRoot', () => {
  if (isIE()) {
    pending('IE not supported')
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
      expect(isShadowRoot(element)).toBe(result)
    })
  })
})

describe('getChildNodes', () => {
  it('should return the direct children for a normal node', () => {
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

describe('getNodeOrShadowHost', () => {
  if (isIE()) {
    pending('IE not supported')
  }
  const parent = document.createElement('div')
  parent.attachShadow({ mode: 'open' })

  const parameters: Array<[Node, Node]> = [
    [parent.shadowRoot!, parent],
    [document.body, document.body],
    [parent, parent],
  ]

  parameters.forEach(([element, result]) => {
    it(`should return ${String(result)} for "${String(element)}"`, () => {
      expect(getNodeOrShadowHost(element)).toBe(result)
    })
  })
})

describe('getParentNode', () => {
  if (isIE()) {
    pending('IE not supported')
  }
  const parentWithShadowRoot = document.createElement('div')
  const shadowRoot = parentWithShadowRoot.attachShadow({ mode: 'open' })
  const childInShadowRoot = document.createElement('span')
  shadowRoot.appendChild(childInShadowRoot)

  const parentWithoutShadowRoot = document.createElement('div')
  const child = document.createElement('span')
  parentWithoutShadowRoot.appendChild(child)

  const parameters: Array<[Node, Node | null]> = [
    [parentWithoutShadowRoot, null],
    [childInShadowRoot, parentWithShadowRoot],
    [child, parentWithoutShadowRoot],
  ]
  parameters.forEach(([element, result]) => {
    it(`should return ${String(result)} for "${String(element)}"`, () => {
      expect(getParentNode(element)).toBe(result)
    })
  })
})
