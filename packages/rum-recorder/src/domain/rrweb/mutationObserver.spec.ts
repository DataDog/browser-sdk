import { isIE } from '@datadog/browser-core'
import { createMutationPayloadValidator } from '../../../test/utils'
import { snapshot, NodeType } from '../rrweb-snapshot'
import { MutationController } from './mutation'
import { startMutationObserver } from './mutationObserver'
import { MutationCallBack } from './types'

describe('startMutationCollection', () => {
  let sandbox: HTMLElement
  let stopMutationCollection: () => void

  function start() {
    const callbackSpy = jasmine.createSpy<MutationCallBack>()
    const controller = new MutationController()

    ;({ stop: stopMutationCollection } = startMutationObserver(controller, callbackSpy))

    return { controller, callbackSpy, getLatestMutationPayload: () => callbackSpy.calls.mostRecent()?.args[0] }
  }

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    sandbox = document.createElement('div')
    sandbox.id = 'sandbox'
    document.body.appendChild(sandbox)
  })

  afterEach(() => {
    stopMutationCollection()
    sandbox.remove()
  })

  describe('childList mutation records', () => {
    it('emits a mutation when a node is appended to a known node', () => {
      const serializedDocument = snapshot(document)[0]!
      const { controller, callbackSpy, getLatestMutationPayload } = start()

      sandbox.appendChild(document.createElement('div'))
      controller.flush()

      expect(callbackSpy).toHaveBeenCalledTimes(1)

      const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: expectNewNode({ type: NodeType.Element, tagName: 'div' }),
          },
        ],
      })
    })

    it('does not emit a mutation when a node is appended to a unknown node', () => {
      // Here, we don't call snapshot(), so the sandbox is 'unknown'.
      const { controller, callbackSpy } = start()

      sandbox.appendChild(document.createElement('div'))
      controller.flush()

      expect(callbackSpy).not.toHaveBeenCalled()
    })

    it('emits buffered mutation records on flush', () => {
      snapshot(document)
      const { controller, callbackSpy } = start()

      sandbox.appendChild(document.createElement('div'))

      expect(callbackSpy).toHaveBeenCalledTimes(0)

      controller.flush()

      expect(callbackSpy).toHaveBeenCalledTimes(1)
    })

    describe('does not emit mutations on removed nodes and their descendants', () => {
      it('attribute mutations', () => {
        const element = document.createElement('div')
        sandbox.appendChild(element)
        snapshot(document)

        const { controller, getLatestMutationPayload } = start()

        element.setAttribute('foo', 'bar')
        sandbox.remove()
        controller.flush()

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = document.createTextNode('foo')
        sandbox.appendChild(textNode)
        snapshot(document)

        const { controller, getLatestMutationPayload } = start()

        textNode.data = 'bar'
        sandbox.remove()
        controller.flush()

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        snapshot(document)

        const { controller, getLatestMutationPayload } = start()

        sandbox.appendChild(document.createElement('div'))
        sandbox.remove()
        controller.flush()

        expect(getLatestMutationPayload().adds).toEqual([])
      })

      it('remove mutations', () => {
        const element = document.createElement('div')
        sandbox.appendChild(element)
        const serializedDocument = snapshot(document)[0]!

        const { controller, getLatestMutationPayload } = start()

        element.remove()
        sandbox.remove()
        controller.flush()

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          removes: [
            {
              parent: expectInitialNode({ tag: 'body' }),
              node: expectInitialNode({ idAttribute: 'sandbox' }),
            },
          ],
        })
      })
    })

    describe('does not emit mutations on freshly serialized nodes and their descendants', () => {
      it('attribute mutations', () => {
        const element = document.createElement('div')
        sandbox.appendChild(element)
        snapshot(document)

        const { controller, getLatestMutationPayload } = start()

        element.remove()
        sandbox.appendChild(element)

        element.setAttribute('foo', 'bar')
        controller.flush()

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = document.createTextNode('foo')
        sandbox.appendChild(textNode)
        snapshot(document)

        const { controller, getLatestMutationPayload } = start()

        textNode.remove()
        sandbox.appendChild(textNode)

        textNode.data = 'bar'
        controller.flush()

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        const parent = document.createElement('a')
        const child = document.createElement('b')
        sandbox.appendChild(parent)
        parent.appendChild(child)
        const serializedDocument = snapshot(document)[0]!

        const { controller, getLatestMutationPayload } = start()

        // Generate a mutation on 'child'
        child.remove()
        parent.appendChild(child)
        // Generate a mutation on 'parent'
        parent.remove()
        sandbox.appendChild(parent)
        controller.flush()

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)

        // Even if the mutation on 'child' comes first, we only take the 'parent' mutation into
        // account since it is embeds an up-to-date snapshot of 'parent'
        validate(getLatestMutationPayload(), {
          adds: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ tag: 'a' }).withChildren(expectInitialNode({ tag: 'b' })),
            },
          ],
          removes: [
            {
              parent: expectInitialNode({ tag: 'a' }),
              node: expectInitialNode({ tag: 'b' }),
            },
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ tag: 'a' }),
            },
          ],
        })
      })

      it('remove mutations', () => {
        const serializedDocument = snapshot(document)[0]!

        const { controller, getLatestMutationPayload } = start()

        const parent = document.createElement('a')
        const child = document.createElement('b')
        parent.appendChild(child)
        sandbox.appendChild(parent)

        child.remove()
        controller.flush()

        const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          adds: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectNewNode({ type: NodeType.Element, tagName: 'a' }),
            },
          ],
        })
      })
    })

    it('emits only an "add" mutation when adding, removing then re-adding a child', () => {
      const element = document.createElement('a')
      const serializedDocument = snapshot(document)[0]!

      const { controller, getLatestMutationPayload } = start()

      sandbox.appendChild(element)
      element.remove()
      sandbox.appendChild(element)

      controller.flush()

      const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: expectNewNode({ type: NodeType.Element, tagName: 'a' }),
          },
        ],
      })
    })

    it('emits an "add" and a "remove" mutation when moving a node', () => {
      const elementA = document.createElement('a')
      const elementB = document.createElement('b')
      sandbox.appendChild(elementA)
      sandbox.appendChild(elementB)
      const serializedDocument = snapshot(document)[0]!

      const { controller, getLatestMutationPayload } = start()

      // Moves 'a' after 'b'
      sandbox.appendChild(elementA)

      controller.flush()

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: expectInitialNode({ tag: 'a' }),
          },
        ],
        removes: [
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: expectInitialNode({ tag: 'a' }),
          },
        ],
      })
    })

    it('uses the initial parent id when removing a node from multiple places', () => {
      const parent = document.createElement('a')
      const child = document.createElement('b')
      parent.appendChild(child)
      sandbox.appendChild(parent)
      const serializedDocument = snapshot(document)[0]!

      const { controller, getLatestMutationPayload } = start()

      // Move child into sandbox
      sandbox.appendChild(child)
      // Move child back into parent
      parent.appendChild(child)

      controller.flush()

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ tag: 'a' }),
            node: expectInitialNode({ tag: 'b' }),
          },
        ],
        removes: [
          {
            parent: expectInitialNode({ tag: 'a' }),
            node: expectInitialNode({ tag: 'b' }),
          },
        ],
      })
    })

    it('keep nodes order when adding multiple sibling nodes', () => {
      const serializedDocument = snapshot(document)[0]!

      const { controller, getLatestMutationPayload } = start()

      sandbox.appendChild(document.createElement('a'))
      sandbox.appendChild(document.createElement('b'))
      sandbox.appendChild(document.createElement('c'))

      controller.flush()

      const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidator(serializedDocument)
      const c = expectNewNode({ type: NodeType.Element, tagName: 'c' })
      const b = expectNewNode({ type: NodeType.Element, tagName: 'b' })
      const a = expectNewNode({ type: NodeType.Element, tagName: 'a' })
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: c,
          },
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: b,
            next: c,
          },
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: a,
            next: b,
          },
        ],
      })
    })
  })

  describe('characterData mutations', () => {
    let textNode: Text

    beforeEach(() => {
      textNode = document.createTextNode('foo')
      sandbox.appendChild(textNode)
    })

    it('emits a mutation when a text node is changed', () => {
      const serializedDocument = snapshot(document)[0]!
      const { controller, callbackSpy, getLatestMutationPayload } = start()

      textNode.data = 'bar'
      controller.flush()

      expect(callbackSpy).toHaveBeenCalledTimes(1)

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        texts: [
          {
            node: expectInitialNode({ text: 'foo' }),
            value: 'bar',
          },
        ],
      })
    })

    it('does not emit a mutation when a text node keeps the same value', () => {
      snapshot(document)
      const { controller, callbackSpy } = start()

      textNode.data = 'bar'
      textNode.data = 'foo'
      controller.flush()

      expect(callbackSpy).not.toHaveBeenCalled()
    })
  })

  describe('attributes mutations', () => {
    it('emits a mutation when an attribute is changed', () => {
      const serializedDocument = snapshot(document)[0]!
      const { controller, callbackSpy, getLatestMutationPayload } = start()

      sandbox.setAttribute('foo', 'bar')
      controller.flush()

      expect(callbackSpy).toHaveBeenCalledTimes(1)

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        attributes: [
          {
            node: expectInitialNode({ idAttribute: 'sandbox' }),
            attributes: { foo: 'bar' },
          },
        ],
      })
    })

    it('does not emit a mutation when an attribute keeps the same value', () => {
      sandbox.setAttribute('foo', 'bar')
      snapshot(document)
      const { controller, callbackSpy } = start()

      sandbox.setAttribute('foo', 'biz')
      sandbox.setAttribute('foo', 'bar')
      controller.flush()

      expect(callbackSpy).not.toHaveBeenCalled()
    })

    it('reuse the same mutation when multiple attributes are changed', () => {
      const serializedDocument = snapshot(document)[0]!
      const { controller, getLatestMutationPayload } = start()

      sandbox.setAttribute('foo1', 'biz')
      sandbox.setAttribute('foo2', 'bar')
      controller.flush()

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        attributes: [
          {
            node: expectInitialNode({ idAttribute: 'sandbox' }),
            attributes: { foo1: 'biz', foo2: 'bar' },
          },
        ],
      })
    })
  })

  describe('ignored nodes', () => {
    let ignoredElement: HTMLElement

    beforeEach(() => {
      ignoredElement = document.createElement('script')
      sandbox.appendChild(ignoredElement)
    })

    it('skips ignored nodes when looking for the next id', () => {
      const serializedDocument = snapshot(document)[0]!

      const { controller, getLatestMutationPayload } = start()

      sandbox.insertBefore(document.createElement('a'), ignoredElement)

      controller.flush()

      const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: expectNewNode({ type: NodeType.Element, tagName: 'a' }),
          },
        ],
      })
    })

    describe('does not emit mutations occurring in ignored node', () => {
      it('when adding an ignored node', () => {
        ignoredElement.remove()
        snapshot(document)[0]!

        const { controller, callbackSpy } = start()

        sandbox.appendChild(ignoredElement)

        controller.flush()

        expect(callbackSpy).not.toHaveBeenCalled()
      })

      it('when changing the attributes of an ignored node', () => {
        snapshot(document)[0]!

        const { controller, callbackSpy } = start()

        ignoredElement.setAttribute('foo', 'bar')

        controller.flush()

        expect(callbackSpy).not.toHaveBeenCalled()
      })

      it('when adding a new child node', () => {
        snapshot(document)[0]!

        const { controller, callbackSpy } = start()

        ignoredElement.appendChild(document.createTextNode('function foo() {}'))

        controller.flush()

        expect(callbackSpy).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = document.createTextNode('function foo() {}')
        sandbox.appendChild(textNode)
        snapshot(document)[0]!
        ignoredElement.appendChild(textNode)

        const { controller, callbackSpy } = start()

        textNode.data = 'function bar() {}'

        controller.flush()

        expect(callbackSpy).not.toHaveBeenCalled()
      })

      it('when adding a known child node', () => {
        const textNode = document.createTextNode('function foo() {}')
        sandbox.appendChild(textNode)
        const serializedDocument = snapshot(document)[0]!

        const { controller, getLatestMutationPayload } = start()

        ignoredElement.appendChild(textNode)

        controller.flush()

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          removes: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ text: 'function foo() {}' }),
            },
          ],
        })
      })
    })
  })

  describe('hidden nodes', () => {
    let hiddenElement: HTMLElement
    beforeEach(() => {
      hiddenElement = document.createElement('div')
      hiddenElement.setAttribute('data-dd-privacy', 'hidden')
      sandbox.appendChild(hiddenElement)
    })

    it('does not emit attribute mutations on hidden nodes', () => {
      snapshot(document)[0]!

      const { controller, callbackSpy } = start()

      hiddenElement.setAttribute('foo', 'bar')

      controller.flush()

      expect(callbackSpy).not.toHaveBeenCalled()
    })

    describe('does not emit mutations occurring in hidden node', () => {
      it('when adding a new node', () => {
        snapshot(document)[0]!

        const { controller, callbackSpy } = start()

        hiddenElement.appendChild(document.createTextNode('function foo() {}'))

        controller.flush()

        expect(callbackSpy).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = document.createTextNode('function foo() {}')
        sandbox.appendChild(textNode)
        snapshot(document)[0]!
        hiddenElement.appendChild(textNode)

        const { controller, callbackSpy } = start()

        textNode.data = 'function bar() {}'

        controller.flush()

        expect(callbackSpy).not.toHaveBeenCalled()
      })

      it('when moving a known node into an hidden node', () => {
        const textNode = document.createTextNode('function foo() {}')
        sandbox.appendChild(textNode)
        const serializedDocument = snapshot(document)[0]!

        const { controller, getLatestMutationPayload } = start()

        hiddenElement.appendChild(textNode)

        controller.flush()

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          removes: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ text: 'function foo() {}' }),
            },
          ],
        })
      })
    })
  })
})
