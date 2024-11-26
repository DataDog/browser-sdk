import { DefaultPrivacyLevel } from '@datadog/browser-core'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { collectAsyncCalls, registerCleanupTask } from '@datadog/browser-core/test'
import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
} from '@datadog/browser-rum-core'
import { createMutationPayloadValidator } from '../../../../test'
import type { AttributeMutation, Attributes, BrowserMutationPayload } from '../../../types'
import { NodeType } from '../../../types'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import type { ShadowRootCallBack } from '../shadowRootsController'
import { appendElement, appendText } from '../../../../../rum-core/test'
import { sortAddedAndMovedNodes, trackMutation } from './trackMutation'
import type { MutationCallBack, MutationTracker } from './trackMutation'
import { DEFAULT_SHADOW_ROOT_CONTROLLER } from './trackers.specHelper'

describe('trackMutation', () => {
  let sandbox: HTMLElement
  let mutationTracker: MutationTracker

  let addShadowRootSpy: jasmine.Spy<ShadowRootCallBack>
  let removeShadowRootSpy: jasmine.Spy<ShadowRootCallBack>

  beforeEach(() => {
    addShadowRootSpy = jasmine.createSpy<ShadowRootCallBack>()
    removeShadowRootSpy = jasmine.createSpy<ShadowRootCallBack>()
  })

  function startMutationCollection(defaultPrivacyLevel: DefaultPrivacyLevel = DefaultPrivacyLevel.ALLOW) {
    const mutationCallbackSpy = jasmine.createSpy<MutationCallBack>()

    mutationTracker = trackMutation(
      mutationCallbackSpy,
      {
        defaultPrivacyLevel,
      } as RumConfiguration,
      { ...DEFAULT_SHADOW_ROOT_CONTROLLER, addShadowRoot: addShadowRootSpy, removeShadowRoot: removeShadowRootSpy },
      document
    )

    return {
      mutationCallbackSpy,
      getLatestMutationPayload: () => mutationCallbackSpy.calls.mostRecent()?.args[0].data as BrowserMutationPayload,
    }
  }

  function serializeDocumentWithDefaults() {
    return serializeDocument(
      document,
      {
        defaultPrivacyLevel: NodePrivacyLevel.ALLOW,
      } as RumConfiguration,
      {
        shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
        status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
        elementsScrollPositions: createElementsScrollPositions(),
      }
    )
  }

  beforeEach(() => {
    sandbox = appendElement('<div id="sandbox"></div>')

    registerCleanupTask(() => {
      mutationTracker.stop()
    })
  })

  describe('childList mutation records', () => {
    it('emits a mutation when a node is appended to a known node', () => {
      const serializedDocument = serializeDocumentWithDefaults()
      const { mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()

      appendElement('<div></div>', sandbox)
      mutationTracker.flush()

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

    it('processes mutations asynchronously', async () => {
      serializeDocumentWithDefaults()
      const { mutationCallbackSpy } = startMutationCollection()

      appendElement('<div></div>', sandbox)

      expect(mutationCallbackSpy).not.toHaveBeenCalled()

      await collectAsyncCalls(mutationCallbackSpy, 1)
    })

    it('does not emit a mutation when a node is appended to a unknown node', () => {
      // Here, we don't call serializeDocument(), so the sandbox is 'unknown'.
      const { mutationCallbackSpy } = startMutationCollection()

      appendElement('<div></div>', sandbox)
      mutationTracker.flush()

      expect(mutationCallbackSpy).not.toHaveBeenCalled()
    })

    it('emits buffered mutation records on flush', () => {
      serializeDocumentWithDefaults()
      const { mutationCallbackSpy } = startMutationCollection()

      appendElement('<div></div>', sandbox)

      expect(mutationCallbackSpy).toHaveBeenCalledTimes(0)

      mutationTracker.flush()

      expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)
    })

    describe('does not emit mutations on removed nodes and their descendants', () => {
      it('attribute mutations', () => {
        const element = appendElement('<div></div>', sandbox)
        serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        element.setAttribute('foo', 'bar')
        sandbox.remove()
        mutationTracker.flush()

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = appendText('text', sandbox)

        serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        textNode.data = 'bar'
        sandbox.remove()
        mutationTracker.flush()

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        appendElement('<div><hr /></div>', sandbox)
        sandbox.remove()
        mutationTracker.flush()

        expect(getLatestMutationPayload().adds).toEqual([])
      })

      it('remove mutations', () => {
        const element = appendElement('<div></div>', sandbox)
        const serializedDocument = serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        element.remove()
        sandbox.remove()
        mutationTracker.flush()

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
        const element = appendElement('<div></div>', sandbox)
        serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        element.remove()
        sandbox.appendChild(element)

        element.setAttribute('foo', 'bar')
        mutationTracker.flush()

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = appendText('foo', sandbox)
        serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        textNode.remove()
        sandbox.appendChild(textNode)

        textNode.data = 'bar'
        mutationTracker.flush()

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        const child = appendElement('<a><b target/></a>', sandbox)
        const parent = child.parentElement!
        const serializedDocument = serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        // Generate a mutation on 'child'
        child.remove()
        parent.appendChild(child)
        // Generate a mutation on 'parent'
        parent.remove()
        sandbox.appendChild(parent)
        mutationTracker.flush()

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
        const serializedDocument = serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        const child = appendElement('<a><b target/></a>', sandbox)

        child.remove()
        mutationTracker.flush()

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
      const serializedDocument = serializeDocumentWithDefaults()

      const { getLatestMutationPayload } = startMutationCollection()

      const element = appendElement('<a></a>', sandbox)

      element.remove()
      sandbox.appendChild(element)

      mutationTracker.flush()

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
      const a = appendElement('<a></a><b/>', sandbox)
      const serializedDocument = serializeDocumentWithDefaults()

      const { getLatestMutationPayload } = startMutationCollection()

      // Moves 'a' after 'b'
      sandbox.appendChild(a)

      mutationTracker.flush()

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
      const span = appendElement(
        `<span></span>
         <a></a>
         <b></b>`,
        sandbox
      )
      const a = span.nextElementSibling!
      const b = a.nextElementSibling!
      const serializedDocument = serializeDocumentWithDefaults()

      const { getLatestMutationPayload } = startMutationCollection()

      a.appendChild(span)
      b.appendChild(span)

      mutationTracker.flush()

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
      const serializedDocument = serializeDocumentWithDefaults()

      const { getLatestMutationPayload } = startMutationCollection()

      appendElement('<a></a><b></b><c></c>', sandbox)

      mutationTracker.flush()

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
      const serializedDocument = serializeDocumentWithDefaults()
      const { getLatestMutationPayload } = startMutationCollection(DefaultPrivacyLevel.MASK)

      sandbox.innerText = 'foo bar'
      mutationTracker.flush()

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

    describe('for shadow DOM', () => {
      it('should call addShadowRoot when host is added', () => {
        const serializedDocument = serializeDocumentWithDefaults()
        const { mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()
        const host = appendElement('<div></div>', sandbox)
        const shadowRoot = host.attachShadow({ mode: 'open' })
        appendElement('<span></span>', shadowRoot)
        mutationTracker.flush()

        expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)
        const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidator(serializedDocument)

        const child = expectNewNode({ type: NodeType.Element, tagName: 'span' })
        const shadowRootNode = expectNewNode({ type: NodeType.DocumentFragment, isShadowRoot: true }).withChildren(
          child
        )
        const expectedHost = expectNewNode({ type: NodeType.Element, tagName: 'div' }).withChildren(shadowRootNode)
        validate(getLatestMutationPayload(), {
          adds: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectedHost,
            },
          ],
        })
        expect(addShadowRootSpy).toHaveBeenCalledOnceWith(shadowRoot)
        expect(removeShadowRootSpy).not.toHaveBeenCalled()
      })

      it('should call removeShadowRoot when host is removed', () => {
        const host = appendElement('<div id="host"></div>', sandbox)
        const shadowRoot = host.attachShadow({ mode: 'open' })
        appendElement('<span></span>', shadowRoot)
        const serializedDocument = serializeDocumentWithDefaults()
        const { mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()
        host.remove()
        mutationTracker.flush()
        expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          removes: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ idAttribute: 'host' }),
            },
          ],
        })
        expect(addShadowRootSpy).not.toHaveBeenCalled()
        expect(removeShadowRootSpy).toHaveBeenCalledOnceWith(shadowRoot)
      })

      it('should call removeShadowRoot when parent of host is removed', () => {
        const host = appendElement('<div id="parent"><div id="host" target></div></div>', sandbox)
        const shadowRoot = host.attachShadow({ mode: 'open' })
        appendElement('<span></span>', shadowRoot)

        const serializedDocument = serializeDocumentWithDefaults()
        const { mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()
        host.parentElement!.remove()
        mutationTracker.flush()
        expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          removes: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ idAttribute: 'parent' }),
            },
          ],
        })
        expect(addShadowRootSpy).not.toHaveBeenCalled()
        expect(removeShadowRootSpy).toHaveBeenCalledOnceWith(shadowRoot)
      })

      it('should call removeShadowRoot when removing a host containing other hosts in its children', () => {
        const parentHost = appendElement('<div id="host"><p></p></div>', sandbox)
        const parentShadowRoot = parentHost.attachShadow({ mode: 'open' })
        const childHost = appendElement('<span></span>', parentHost.querySelector('p')!)
        const childShadowRoot = childHost.attachShadow({ mode: 'open' })

        const serializedDocument = serializeDocumentWithDefaults()
        const { mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()
        parentHost.remove()
        mutationTracker.flush()
        expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          removes: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ idAttribute: 'host' }),
            },
          ],
        })
        expect(addShadowRootSpy).not.toHaveBeenCalled()
        expect(removeShadowRootSpy).toHaveBeenCalledTimes(2)
        // Note: `toHaveBeenCalledWith` does not assert strict equality, we need to actually
        // retrieve the argument and using `toBe` to make sure the spy has been called with both
        // shadow roots.
        expect(removeShadowRootSpy.calls.argsFor(0)[0]).toBe(parentShadowRoot)
        expect(removeShadowRootSpy.calls.argsFor(1)[0]).toBe(childShadowRoot)
      })
    })
  })

  describe('characterData mutations', () => {
    let textNode: Text

    beforeEach(() => {
      textNode = appendText('foo', sandbox)
    })

    it('emits a mutation when a text node is changed', () => {
      const serializedDocument = serializeDocumentWithDefaults()
      const { mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()

      textNode.data = 'bar'
      mutationTracker.flush()

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

    it('emits a mutation when an empty text node is changed', () => {
      textNode.data = ''
      serializeDocumentWithDefaults()
      const { mutationCallbackSpy } = startMutationCollection()

      textNode.data = 'bar'
      mutationTracker.flush()

      expect(mutationCallbackSpy).toHaveBeenCalledTimes(1)
    })

    it('does not emit a mutation when a text node keeps the same value', () => {
      serializeDocumentWithDefaults()
      const { mutationCallbackSpy } = startMutationCollection()

      textNode.data = 'bar'
      textNode.data = 'foo'
      mutationTracker.flush()

      expect(mutationCallbackSpy).not.toHaveBeenCalled()
    })

    it('respects the default privacy level setting', () => {
      const serializedDocument = serializeDocumentWithDefaults()
      const { getLatestMutationPayload } = startMutationCollection(DefaultPrivacyLevel.MASK)

      textNode.data = 'foo bar'
      mutationTracker.flush()

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
      sandbox.setAttribute('data-dd-privacy', 'allow')
      const div = appendElement('<div>foo 81</div>', sandbox)

      const serializedDocument = serializeDocumentWithDefaults()
      const { mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection(DefaultPrivacyLevel.MASK)

      div.firstChild!.textContent = 'bazz 7'
      mutationTracker.flush()

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
      const serializedDocument = serializeDocumentWithDefaults()
      const { mutationCallbackSpy, getLatestMutationPayload } = startMutationCollection()

      sandbox.setAttribute('foo', 'bar')
      mutationTracker.flush()

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
      const serializedDocument = serializeDocumentWithDefaults()
      const { getLatestMutationPayload } = startMutationCollection()

      sandbox.setAttribute('foo', '')
      mutationTracker.flush()

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
      const serializedDocument = serializeDocumentWithDefaults()
      const { getLatestMutationPayload } = startMutationCollection()

      sandbox.removeAttribute('foo')
      mutationTracker.flush()

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
      serializeDocumentWithDefaults()
      const { mutationCallbackSpy } = startMutationCollection()

      sandbox.setAttribute('foo', 'biz')
      sandbox.setAttribute('foo', 'bar')
      mutationTracker.flush()

      expect(mutationCallbackSpy).not.toHaveBeenCalled()
    })

    it('reuse the same mutation when multiple attributes are changed', () => {
      const serializedDocument = serializeDocumentWithDefaults()
      const { getLatestMutationPayload } = startMutationCollection()

      sandbox.setAttribute('foo1', 'biz')
      sandbox.setAttribute('foo2', 'bar')
      mutationTracker.flush()

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
      const serializedDocument = serializeDocumentWithDefaults()
      const { getLatestMutationPayload } = startMutationCollection(DefaultPrivacyLevel.MASK)

      sandbox.setAttribute('data-foo', 'biz')
      mutationTracker.flush()

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
      ignoredElement = appendElement('<script></script>', sandbox)
    })

    it('skips ignored nodes when looking for the next id', () => {
      const serializedDocument = serializeDocumentWithDefaults()

      const { getLatestMutationPayload } = startMutationCollection()

      sandbox.insertBefore(document.createElement('a'), ignoredElement)

      mutationTracker.flush()

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
        serializeDocumentWithDefaults()

        const { mutationCallbackSpy } = startMutationCollection()

        sandbox.appendChild(ignoredElement)

        mutationTracker.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when changing the attributes of an ignored node', () => {
        serializeDocumentWithDefaults()

        const { mutationCallbackSpy } = startMutationCollection()

        ignoredElement.setAttribute('foo', 'bar')

        mutationTracker.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when adding a new child node', () => {
        serializeDocumentWithDefaults()

        const { mutationCallbackSpy } = startMutationCollection()

        appendElement("'function foo() {}'", ignoredElement)

        mutationTracker.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = appendText('function foo() {}', sandbox)

        serializeDocumentWithDefaults()
        ignoredElement.appendChild(textNode)

        const { mutationCallbackSpy } = startMutationCollection()

        textNode.data = 'function bar() {}'

        mutationTracker.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when adding a known child node', () => {
        const textNode = appendText('function foo() {}', sandbox)
        const serializedDocument = serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        ignoredElement.appendChild(textNode)

        mutationTracker.flush()

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
        const script = appendElement('<a></a><script target></script><b><b/>', sandbox)

        serializeDocumentWithDefaults()

        const { mutationCallbackSpy } = startMutationCollection()

        sandbox.appendChild(script)
        mutationTracker.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })
    })
  })

  describe('hidden nodes', () => {
    let hiddenElement: HTMLElement
    beforeEach(() => {
      hiddenElement = appendElement("<div data-dd-privacy='hidden'></div>", sandbox)
    })

    it('does not emit attribute mutations on hidden nodes', () => {
      serializeDocumentWithDefaults()

      const { mutationCallbackSpy } = startMutationCollection()

      hiddenElement.setAttribute('foo', 'bar')

      mutationTracker.flush()

      expect(mutationCallbackSpy).not.toHaveBeenCalled()
    })

    describe('does not emit mutations occurring in hidden node', () => {
      it('when adding a new node', () => {
        serializeDocumentWithDefaults()

        const { mutationCallbackSpy } = startMutationCollection()

        appendElement('function foo() {}', hiddenElement)

        mutationTracker.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = appendText('function foo() {}', sandbox)

        serializeDocumentWithDefaults()
        hiddenElement.appendChild(textNode)

        const { mutationCallbackSpy } = startMutationCollection()

        textNode.data = 'function bar() {}'

        mutationTracker.flush()

        expect(mutationCallbackSpy).not.toHaveBeenCalled()
      })

      it('when moving a known node into an hidden node', () => {
        const textNode = appendText('function foo() {}', sandbox)
        const serializedDocument = serializeDocumentWithDefaults()

        const { getLatestMutationPayload } = startMutationCollection()

        hiddenElement.appendChild(textNode)

        mutationTracker.flush()

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
          const serializedDocument = serializeDocumentWithDefaults()

          const { getLatestMutationPayload } = startMutationCollection()

          sandbox.appendChild(input)
          mutationTracker.flush()

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
          const serializedDocument = serializeDocumentWithDefaults()

          const { getLatestMutationPayload, mutationCallbackSpy } = startMutationCollection()

          input.setAttribute('value', 'bar')
          mutationTracker.flush()

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
