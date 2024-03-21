import { isIE } from '@datadog/browser-core'
import { appendElement, appendText } from '../../test'
import {
  isTextNode,
  isCommentNode,
  isElementNode,
  isNodeShadowRoot,
  getParentNode,
  isNodeShadowHost,
  forEachChildNodes,
  hasChildNodes,
  getClassList,
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

describe('hasChildNode', () => {
  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
  })

  it('should return `true` if the element has a direct child node', () => {
    expect(hasChildNodes(appendElement('<div>foo</div>'))).toBe(true)
    expect(hasChildNodes(appendElement('<div><hr /></div>'))).toBe(true)
    expect(hasChildNodes(appendElement('<div><!--  --></div>'))).toBe(true)
  })

  it('should return `true` if the element is a shadow host', () => {
    const container = appendElement('<div></div>')
    container.attachShadow({ mode: 'open' })
    expect(hasChildNodes(container)).toBe(true)
  })

  it('should return `false` otherwise', () => {
    expect(hasChildNodes(appendElement('<div></div>'))).toBe(false)
    expect(hasChildNodes(appendText('foo'))).toBe(false)
  })
})

describe('forEachChildNodes', () => {
  it('should iterate over the direct children for a normal node', () => {
    if (isIE()) {
      pending('IE not supported')
    }

    const container = appendElement(`
      <div>toto<span></span><!-- --></div>
    `)

    const spy = jasmine.createSpy()
    forEachChildNodes(container, spy)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('should iterate over the the shadow root for a node that is a host', () => {
    if (isIE()) {
      pending('IE not supported')
    }

    const container = appendElement('<div></div>')
    const shadowRoot = container.attachShadow({ mode: 'open' })

    const spy = jasmine.createSpy()
    forEachChildNodes(container, spy)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.calls.argsFor(0)[0]).toBe(shadowRoot)
  })

  it('should iterate over the the shadow root and direct children for a node that is a host', () => {
    if (isIE()) {
      pending('IE not supported')
    }

    const container = appendElement('<div><span></span></div>')
    const shadowRoot = container.attachShadow({ mode: 'open' })

    const spy = jasmine.createSpy()
    forEachChildNodes(container, spy)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.calls.argsFor(0)[0]).toBe(container.childNodes[0])
    expect(spy.calls.argsFor(1)[0]).toBe(shadowRoot)
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

describe('getClassList', () => {
  it('should return the classList of an element that supports the classList attribute', () => {
    const divElement = appendElement('<div class="foo bar"></div>')
    const classList = getClassList(divElement)
    expect(classList[0]).toEqual('foo')
    expect(classList[1]).toEqual('bar')
  })

  it('should return the classList of an element that does not support the classList attribute (e.g.: svg on IE)', () => {
    const svgElement = appendElement('<svg class="foo bar"></svg>')
    Object.defineProperty(svgElement, 'classList', { get: () => undefined })
    const classList = getClassList(svgElement)
    expect(classList[0]).toEqual('foo')
    expect(classList[1]).toEqual('bar')
  })
})
