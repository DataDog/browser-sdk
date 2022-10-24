import { isIE } from '@datadog/browser-core'
import { isTextNode, isCommentNode, isElementNode, getChildNodes } from './htmlDomUtils'

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
