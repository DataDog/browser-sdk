import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { collectAsyncCalls, createMutationPayloadValidator } from '../../../test/utils'
import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
} from '../../constants'
import type { AttributeMutation, Attributes } from '../../types'
import { NodeType } from '../../types'
import { serializeDocument } from './serialize'
import { sortAddedAndMovedNodes, startMutationObserver, MutationController } from './mutationObserver'
import type { MutationCallBack } from './observer'

describe('startMutationCollection', () => {
  let sandbox: HTMLElement
  let stopMutationCollection: () => void

  function startMutationCollection(defaultPrivacyLevel: DefaultPrivacyLevel = DefaultPrivacyLevel.ALLOW) {
    const mutationCallbackSpy = jasmine.createSpy<MutationCallBack>()
    const mutationController = new MutationController()

    ;({ stop: stopMutationCollection } = startMutationObserver(
      mutationController,
      mutationCallbackSpy,
      defaultPrivacyLevel
    ))

    return {
      mutationController,
      mutationCallbackSpy,
      getLatestMutationPayload: () => mutationCallbackSpy.calls.mostRecent()?.args[0],
    }
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
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()

      sandbox.appendChild(document.createElement('div'))
      mutationController.flush()

      expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)

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

    it('processes mutations asynchronously', (done) => {
      serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationCallbackSpy } = startMutationCollection()
      const { waitAsyncCalls: waitMutationCallbackCalls, expectNoExtraAsyncCall: expectNoExtraMutationCallbackCalls } =
        collectAsyncCalls(mutationCallbackSpy)

      sandbox.appendChild(document.createElement('div'))

      expect(mutationCallbackSpy).not.toHaveBeenCalled()

      waitMutationCallbackCalls(1, () => {
        expectNoExtraMutationCallbackCalls(done)
      })
    })

    it('does not emit a mutation when a node is appended to a unknown node', () => {
      // Here, we don't call serializeDocument(), so the sandbox is 'unknown'.
      const { mutationController, mutationCallbackSpy } = startMutationCollection()

      sandbox.appendChild(document.createElement('div'))
      mutationController.flush()

      expect(mutationCallbackSpy).not.toHaveBeenCalled()
    })

    it('emits buffered mutation records on flush', () => {
      serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, mutationCallbackSpy } = startMutationCollection()

      sandbox.appendChild(document.createElement('div'))

      expect(mutationCallbackSpy).toHaveBeenCalledTimes(0)

      mutationController.flush()

      expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)
    })

    describe('does not emit mutations on removed nodes and their descendants', () => {
      it('attribute mutations', () => {
        const element = document.createElement('div')
        sandbox.appendChild(element)
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        element.setAttribute('foo', 'bar')
        sandbox.remove()
        mutationController.flush()

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = document.createTextNode('foo')
        sandbox.appendChild(textNode)
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        textNode.data = 'bar'
        sandbox.remove()
        mutationController.flush()

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        sandbox.appendChild(document.createElement('div'))
        sandbox.remove()
        mutationController.flush()

        expect(getLatestMutationPayload().adds).toEqual([])
      })

      it('remove mutations', () => {
        const element = document.createElement('div')
        sandbox.appendChild(element)
        const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        element.remove()
        sandbox.remove()
        mutationController.flush()

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

    describe('does not emit mutations on freshly re-serialized nodes and their descendants', () => {
      // Note about those tests: any mutation with a not-yet-serialized 'target' will be trivially
      // ignored. We want to focus on mutations with a 'target' that have already been serialized
      // (during the document serialization for example), and re-serialized (by being added in the
      // document) during the processed mutation batched.

      it('attribute mutations', () => {
        const element = document.createElement('div')
        sandbox.appendChild(element)
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        element.remove()
        sandbox.appendChild(element)

        element.setAttribute('foo', 'bar')
        mutationController.flush()

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = document.createTextNode('foo')
        sandbox.appendChild(textNode)
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        textNode.remove()
        sandbox.appendChild(textNode)

        textNode.data = 'bar'
        mutationController.flush()

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        const parent = document.createElement('a')
        const child = document.createElement('b')
        sandbox.appendChild(parent)
        parent.appendChild(child)
        const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        // Generate a mutation on 'child'
        child.remove()
        parent.appendChild(child)
        // Generate a mutation on 'parent'
        parent.remove()
        sandbox.appendChild(parent)
        mutationController.flush()

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)

        // Even if the mutation on 'child' comes first, we only take the 'parent' mutation into
        // account since it is embeds an up-to-date serialization of 'parent'
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
        const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        const parent = document.createElement('a')
        const child = document.createElement('b')
        parent.appendChild(child)
        sandbox.appendChild(parent)

        child.remove()
        mutationController.flush()

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
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

      const { mutationController, getLatestMutationPayload } = startMutationCollection()

      sandbox.appendChild(element)
      element.remove()
      sandbox.appendChild(element)

      mutationController.flush()

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
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

      const { mutationController, getLatestMutationPayload } = startMutationCollection()

      // Moves 'a' after 'b'
      sandbox.appendChild(elementA)

      mutationController.flush()

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
      const container1 = document.createElement('a')
      const container2 = document.createElement('b')
      const element = document.createElement('span')
      sandbox.appendChild(element)
      sandbox.appendChild(container1)
      sandbox.appendChild(container2)
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

      const { mutationController, getLatestMutationPayload } = startMutationCollection()

      container1.appendChild(element)
      container2.appendChild(element)

      mutationController.flush()

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ tag: 'b' }),
            node: expectInitialNode({ tag: 'span' }),
          },
        ],
        removes: [
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: expectInitialNode({ tag: 'span' }),
          },
        ],
      })
    })

    it('keep nodes order when adding multiple sibling nodes', () => {
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

      const { mutationController, getLatestMutationPayload } = startMutationCollection()

      sandbox.appendChild(document.createElement('a'))
      sandbox.appendChild(document.createElement('b'))
      sandbox.appendChild(document.createElement('c'))

      mutationController.flush()

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

    it('respects the default privacy level setting', () => {
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, getLatestMutationPayload } = startMutationCollection(DefaultPrivacyLevel.MASK)

      sandbox.innerText = 'foo bar'
      mutationController.flush()

      const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: expectNewNode({
              type: NodeType.Text,
              textContent: 'xxx xxx',
            }),
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
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()

      textNode.data = 'bar'
      mutationController.flush()

      expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)

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
      serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, mutationCallbackSpy } = startMutationCollection()

      textNode.data = 'bar'
      textNode.data = 'foo'
      mutationController.flush()

      expect(mutationCallbackSpy).not.toHaveBeenCalled()
    })

    it('respects the default privacy level setting', () => {
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, getLatestMutationPayload } = startMutationCollection(DefaultPrivacyLevel.MASK)

      textNode.data = 'foo bar'
      mutationController.flush()

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        texts: [
          {
            node: expectInitialNode({ text: 'foo' }),
            value: 'xxx xxx',
          },
        ],
      })
    })

    it('respects the parent privacy level when emitting a text node mutation', () => {
      const wrapper = document.createElement('div')
      wrapper.setAttribute('data-dd-privacy', 'allow')
      document.body.appendChild(wrapper)

      const div = document.createElement('div')
      div.innerText = 'foo 81'
      wrapper.appendChild(div)

      const serializedDocument = serializeDocument(document, NodePrivacyLevel.MASK)
      const { mutationController, mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection(
        DefaultPrivacyLevel.MASK
      )

      div.firstChild!.textContent = 'bazz 7'
      mutationController.flush()

      expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        texts: [
          {
            node: expectInitialNode({ text: 'foo 81' }),
            value: 'bazz 7',
          },
        ],
      })
    })
  })

  describe('attributes mutations', () => {
    it('emits a mutation when an attribute is changed', () => {
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()

      sandbox.setAttribute('foo', 'bar')
      mutationController.flush()

      expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)

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

    it('emits a mutation with an empty string when an attribute is changed to an empty string', () => {
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, getLatestMutationPayload } = startMutationCollection()

      sandbox.setAttribute('foo', '')
      mutationController.flush()

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        attributes: [
          {
            node: expectInitialNode({ idAttribute: 'sandbox' }),
            attributes: { foo: '' },
          },
        ],
      })
    })

    it('emits a mutation with `null` when an attribute is removed', () => {
      sandbox.setAttribute('foo', 'bar')
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, getLatestMutationPayload } = startMutationCollection()

      sandbox.removeAttribute('foo')
      mutationController.flush()

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        attributes: [
          {
            node: expectInitialNode({ idAttribute: 'sandbox' }),
            attributes: { foo: null },
          },
        ],
      })
    })

    it('does not emit a mutation when an attribute keeps the same value', () => {
      sandbox.setAttribute('foo', 'bar')
      serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, mutationCallbackSpy } = startMutationCollection()

      sandbox.setAttribute('foo', 'biz')
      sandbox.setAttribute('foo', 'bar')
      mutationController.flush()

      expect(mutationCallbackSpy).not.toHaveBeenCalled()
    })

    it('reuse the same mutation when multiple attributes are changed', () => {
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, getLatestMutationPayload } = startMutationCollection()

      sandbox.setAttribute('foo1', 'biz')
      sandbox.setAttribute('foo2', 'bar')
      mutationController.flush()

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

    it('respects the default privacy level setting', () => {
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)
      const { mutationController, getLatestMutationPayload } = startMutationCollection(DefaultPrivacyLevel.MASK)

      sandbox.setAttribute('data-foo', 'biz')
      mutationController.flush()

      const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        attributes: [
          {
            node: expectInitialNode({ idAttribute: 'sandbox' }),
            attributes: { 'data-foo': '***' },
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
      const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

      const { mutationController, getLatestMutationPayload } = startMutationCollection()

      sandbox.insertBefore(document.createElement('a'), ignoredElement)

      mutationController.flush()

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
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, mutationCallbackSpy } = startMutationCollection()

        sandbox.appendChild(ignoredElement)

        mutationController.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when changing the attributes of an ignored node', () => {
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, mutationCallbackSpy } = startMutationCollection()

        ignoredElement.setAttribute('foo', 'bar')

        mutationController.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when adding a new child node', () => {
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, mutationCallbackSpy } = startMutationCollection()

        ignoredElement.appendChild(document.createTextNode('function foo() {}'))

        mutationController.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = document.createTextNode('function foo() {}')
        sandbox.appendChild(textNode)
        serializeDocument(document, NodePrivacyLevel.ALLOW)
        ignoredElement.appendChild(textNode)

        const { mutationController, mutationCallbackSpy } = startMutationCollection()

        textNode.data = 'function bar() {}'

        mutationController.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when adding a known child node', () => {
        const textNode = document.createTextNode('function foo() {}')
        sandbox.appendChild(textNode)
        const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        ignoredElement.appendChild(textNode)

        mutationController.flush()

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

      it('when moving an ignored node', () => {
        const a = document.createElement('a')
        const b = document.createElement('b')
        const script = document.createElement('script')

        sandbox.appendChild(a)
        sandbox.appendChild(script)
        sandbox.appendChild(b)
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, mutationCallbackSpy } = startMutationCollection()

        sandbox.appendChild(script)
        mutationController.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
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
      serializeDocument(document, NodePrivacyLevel.ALLOW)

      const { mutationController, mutationCallbackSpy } = startMutationCollection()

      hiddenElement.setAttribute('foo', 'bar')

      mutationController.flush()

      expect(mutationCallbackSpy).not.toHaveBeenCalled()
    })

    describe('does not emit mutations occurring in hidden node', () => {
      it('when adding a new node', () => {
        serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, mutationCallbackSpy } = startMutationCollection()

        hiddenElement.appendChild(document.createTextNode('function foo() {}'))

        mutationController.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = document.createTextNode('function foo() {}')
        sandbox.appendChild(textNode)
        serializeDocument(document, NodePrivacyLevel.ALLOW)
        hiddenElement.appendChild(textNode)

        const { mutationController, mutationCallbackSpy } = startMutationCollection()

        textNode.data = 'function bar() {}'

        mutationController.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when moving a known node into an hidden node', () => {
        const textNode = document.createTextNode('function foo() {}')
        sandbox.appendChild(textNode)
        const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

        const { mutationController, getLatestMutationPayload } = startMutationCollection()

        hiddenElement.appendChild(textNode)

        mutationController.flush()

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

  describe('inputs privacy', () => {
    const testsVariations: Array<{
      privacyAttributeValue: string
      privacyAttributeOn: 'input' | 'ancestor'
      expectedSerializedAttributes: Attributes
      expectedAttributesMutation: AttributeMutation['attributes'] | null
    }> = [
      {
        privacyAttributeValue: PRIVACY_ATTR_VALUE_MASK,
        privacyAttributeOn: 'input',
        expectedSerializedAttributes: {
          [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_MASK,
          value: '***',
        },
        expectedAttributesMutation: { value: '***' },
      },
      {
        privacyAttributeValue: PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
        privacyAttributeOn: 'input',
        expectedSerializedAttributes: {
          [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
          value: '***',
        },
        expectedAttributesMutation: { value: '***' },
      },
      {
        privacyAttributeValue: PRIVACY_ATTR_VALUE_ALLOW,
        privacyAttributeOn: 'input',
        expectedSerializedAttributes: {
          [PRIVACY_ATTR_NAME]: PRIVACY_ATTR_VALUE_ALLOW,
          value: 'foo',
        },
        expectedAttributesMutation: { value: 'foo' },
      },
      {
        privacyAttributeValue: PRIVACY_ATTR_VALUE_MASK,
        privacyAttributeOn: 'ancestor',
        expectedSerializedAttributes: { value: '***' },
        expectedAttributesMutation: { value: '***' },
      },
      {
        privacyAttributeValue: PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
        privacyAttributeOn: 'ancestor',
        expectedSerializedAttributes: { value: '***' },
        expectedAttributesMutation: { value: '***' },
      },
      {
        privacyAttributeValue: PRIVACY_ATTR_VALUE_ALLOW,
        privacyAttributeOn: 'ancestor',
        expectedSerializedAttributes: { value: 'foo' },
        expectedAttributesMutation: { value: 'foo' },
      },
    ]

    for (const {
      privacyAttributeValue,
      privacyAttributeOn,
      expectedSerializedAttributes,
      expectedAttributesMutation,
    } of testsVariations) {
      describe(`${privacyAttributeValue} mode on ${privacyAttributeOn} element`, () => {
        it('respects the privacy mode for newly added inputs', () => {
          const input = document.createElement('input')
          input.value = 'foo'
          if (privacyAttributeOn === 'input') {
            input.setAttribute(PRIVACY_ATTR_NAME, privacyAttributeValue)
          } else {
            sandbox.setAttribute(PRIVACY_ATTR_NAME, privacyAttributeValue)
          }
          const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

          const { mutationController, getLatestMutationPayload } = startMutationCollection()

          sandbox.appendChild(input)
          mutationController.flush()

          const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
          validate(getLatestMutationPayload(), {
            adds: [
              {
                parent: expectInitialNode({ idAttribute: 'sandbox' }),
                node: expectNewNode({
                  type: NodeType.Element,
                  tagName: 'input',
                  attributes: expectedSerializedAttributes,
                }),
              },
            ],
          })
        })

        it('respects the privacy mode for attribute mutations', () => {
          const input = document.createElement('input')
          input.value = 'foo'
          if (privacyAttributeOn === 'input') {
            input.setAttribute(PRIVACY_ATTR_NAME, privacyAttributeValue)
          } else {
            sandbox.setAttribute(PRIVACY_ATTR_NAME, privacyAttributeValue)
          }
          sandbox.appendChild(input)
          const serializedDocument = serializeDocument(document, NodePrivacyLevel.ALLOW)

          const { mutationController, getLatestMutationPayload, mutationCallbackSpy } = startMutationCollection()

          input.setAttribute('value', 'bar')
          mutationController.flush()

          if (expectedAttributesMutation) {
            const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
            validate(getLatestMutationPayload(), {
              attributes: [{ node: expectInitialNode({ tag: 'input' }), attributes: expectedAttributesMutation }],
            })
          } else {
            expect(mutationCallbackSpy).not.toHaveBeenCalled()
          }
        })
      })
    }
  })
})

describe('sortAddedAndMovedNodes', () => {
  let parent: Node
  let a: Node
  let aa: Node
  let b: Node
  let c: Node
  let d: Node

  beforeEach(() => {
    // Create a tree like this:
    //     parent
    //     / | \ \
    //    a  b c d
    //    |
    //    aa
    a = document.createElement('a')
    aa = document.createElement('aa')
    b = document.createElement('b')
    c = document.createElement('c')
    d = document.createElement('d')
    parent = document.createElement('parent')
    parent.appendChild(a)
    a.appendChild(aa)
    parent.appendChild(b)
    parent.appendChild(c)
    parent.appendChild(d)
  })

  it('sorts siblings in reverse order', () => {
    const nodes = [c, b, d, a]
    sortAddedAndMovedNodes(nodes)
    expect(nodes).toEqual([d, c, b, a])
  })

  it('sorts parents', () => {
    const nodes = [a, parent, aa]
    sortAddedAndMovedNodes(nodes)
    expect(nodes).toEqual([parent, a, aa])
  })

  it('sorts parents first then siblings', () => {
    const nodes = [c, aa, b, parent, d, a]
    sortAddedAndMovedNodes(nodes)
    expect(nodes).toEqual([parent, d, c, b, a, aa])
  })
})
