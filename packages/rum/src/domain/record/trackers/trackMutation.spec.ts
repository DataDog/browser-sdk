import { DefaultPrivacyLevel } from '@datadog/browser-core'
import { collectAsyncCalls, registerCleanupTask } from '@datadog/browser-core/test'
import {
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
} from '@datadog/browser-rum-core'
import { createMutationPayloadValidator } from '../../../../test'
import type {
  AttributeMutation,
  Attributes,
  BrowserIncrementalSnapshotRecord,
  BrowserMutationPayload,
} from '../../../types'
import { NodeType } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import type { AddShadowRootCallBack, RemoveShadowRootCallBack } from '../shadowRootsController'
import { appendElement, appendText } from '../../../../../rum-core/test'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { idsAreAssignedForNodeAndAncestors, sortAddedAndMovedNodes, trackMutation } from './trackMutation'
import type { MutationTracker } from './trackMutation'

describe('trackMutation', () => {
  let sandbox: HTMLElement

  let addShadowRootSpy: jasmine.Spy<AddShadowRootCallBack>
  let removeShadowRootSpy: jasmine.Spy<RemoveShadowRootCallBack>
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>
  let emitStatsCallback: jasmine.Spy<EmitStatsCallback>

  beforeEach(() => {
    sandbox = appendElement('<div id="sandbox"></div>')

    addShadowRootSpy = jasmine.createSpy()
    removeShadowRootSpy = jasmine.createSpy()
    emitRecordCallback = jasmine.createSpy()
    emitStatsCallback = jasmine.createSpy()
  })

  function getRecordingScope(defaultPrivacyLevel: DefaultPrivacyLevel = DefaultPrivacyLevel.ALLOW): RecordingScope {
    return createRecordingScopeForTesting({
      configuration: { defaultPrivacyLevel },
      addShadowRoot: addShadowRootSpy,
      removeShadowRoot: removeShadowRootSpy,
    })
  }

  function startMutationCollection(scope: RecordingScope): MutationTracker {
    const mutationTracker = trackMutation(document, emitRecordCallback, emitStatsCallback, scope)
    registerCleanupTask(() => {
      mutationTracker.stop()
    })
    return mutationTracker
  }

  function getLatestMutationPayload(): BrowserMutationPayload {
    const latestRecord = emitRecordCallback.calls.mostRecent()?.args[0] as BrowserIncrementalSnapshotRecord
    return latestRecord.data as BrowserMutationPayload
  }

  describe('childList mutation records', () => {
    it('emits a mutation when a node is appended to a known node', () => {
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      appendElement('<div></div>', sandbox)
      mutationTracker.flush()

      expect(emitRecordCallback).toHaveBeenCalledTimes(1)

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

    it('emits serialization stats with mutations', () => {
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      const cssText = 'body { width: 100%; }'
      appendElement(`<style>${cssText}</style>`, sandbox)
      mutationTracker.flush()

      expect(emitRecordCallback).toHaveBeenCalledTimes(1)

      const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ idAttribute: 'sandbox' }),
            node: expectNewNode({
              type: NodeType.Element,
              tagName: 'style',
              attributes: { _cssText: cssText },
            }),
          },
        ],
      })

      expect(emitStatsCallback.calls.mostRecent().args[0]).toEqual({
        cssText: { count: 1, max: 21, sum: 21 },
        serializationDuration: jasmine.anything(),
      })
    })

    it('processes mutations asynchronously', async () => {
      const scope = getRecordingScope()
      takeFullSnapshotForTesting(scope)
      startMutationCollection(scope)

      appendElement('<div></div>', sandbox)

      expect(emitRecordCallback).not.toHaveBeenCalled()

      await collectAsyncCalls(emitRecordCallback)
    })

    it('does not emit a mutation when a node is appended to a unknown node', () => {
      const scope = getRecordingScope()

      // Here, we don't call takeFullSnapshotForTesting(), so the sandbox is 'unknown'.
      const mutationTracker = startMutationCollection(scope)

      appendElement('<div></div>', sandbox)
      mutationTracker.flush()

      expect(emitRecordCallback).not.toHaveBeenCalled()
    })

    it('emits buffered mutation records on flush', () => {
      const scope = getRecordingScope()
      takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      appendElement('<div></div>', sandbox)

      expect(emitRecordCallback).toHaveBeenCalledTimes(0)

      mutationTracker.flush()

      expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    })

    describe('does not emit mutations on removed nodes and their descendants', () => {
      it('attribute mutations', () => {
        const element = appendElement('<div></div>', sandbox)

        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        element.setAttribute('foo', 'bar')
        sandbox.remove()
        mutationTracker.flush()

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = appendText('text', sandbox)

        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        textNode.data = 'bar'
        sandbox.remove()
        mutationTracker.flush()

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        appendElement('<div><hr /></div>', sandbox)
        sandbox.remove()
        mutationTracker.flush()

        expect(getLatestMutationPayload().adds).toEqual([])
      })

      it('remove mutations', () => {
        const element = appendElement('<div></div>', sandbox)

        const scope = getRecordingScope()
        const serializedDocument = takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

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

        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        element.remove()
        sandbox.appendChild(element)

        element.setAttribute('foo', 'bar')
        mutationTracker.flush()

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = appendText('foo', sandbox)

        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        textNode.remove()
        sandbox.appendChild(textNode)

        textNode.data = 'bar'
        mutationTracker.flush()

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        const child = appendElement('<a><b target/></a>', sandbox)
        const parent = child.parentElement!

        const scope = getRecordingScope()
        const serializedDocument = takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

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
        const scope = getRecordingScope()
        const serializedDocument = takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

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
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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

      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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

      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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
      const scope = getRecordingScope(DefaultPrivacyLevel.MASK)
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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
        const scope = getRecordingScope()
        const serializedDocument = takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        const host = appendElement('<div></div>', sandbox)
        const shadowRoot = host.attachShadow({ mode: 'open' })
        appendElement('<span></span>', shadowRoot)
        mutationTracker.flush()

        expect(emitRecordCallback).toHaveBeenCalledTimes(1)
        const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidator(serializedDocument)

        const expectedHost = expectNewNode({ type: NodeType.Element, tagName: 'div' })
        const shadowRootNode = expectNewNode({ type: NodeType.DocumentFragment, isShadowRoot: true })
        const child = expectNewNode({ type: NodeType.Element, tagName: 'span' })
        validate(getLatestMutationPayload(), {
          adds: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectedHost.withChildren(shadowRootNode.withChildren(child)),
            },
          ],
        })
        expect(addShadowRootSpy).toHaveBeenCalledOnceWith(shadowRoot, jasmine.anything())
        expect(removeShadowRootSpy).not.toHaveBeenCalled()
      })

      it('should call removeShadowRoot when host is removed', () => {
        const host = appendElement('<div id="host"></div>', sandbox)
        const shadowRoot = host.attachShadow({ mode: 'open' })
        appendElement('<span></span>', shadowRoot)

        const scope = getRecordingScope()
        const serializedDocument = takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        host.remove()
        mutationTracker.flush()
        expect(emitRecordCallback).toHaveBeenCalledTimes(1)
        expect(addShadowRootSpy).toHaveBeenCalledTimes(1)

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          removes: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ idAttribute: 'host' }),
            },
          ],
        })
        expect(addShadowRootSpy).toHaveBeenCalledTimes(1)
        expect(removeShadowRootSpy).toHaveBeenCalledOnceWith(shadowRoot)
      })

      it('should call removeShadowRoot when parent of host is removed', () => {
        const host = appendElement('<div id="parent"><div id="host" target></div></div>', sandbox)
        const shadowRoot = host.attachShadow({ mode: 'open' })
        appendElement('<span></span>', shadowRoot)

        const scope = getRecordingScope()
        const serializedDocument = takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        host.parentElement!.remove()
        mutationTracker.flush()
        expect(emitRecordCallback).toHaveBeenCalledTimes(1)
        expect(addShadowRootSpy).toHaveBeenCalledTimes(1)

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          removes: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ idAttribute: 'parent' }),
            },
          ],
        })
        expect(addShadowRootSpy).toHaveBeenCalledTimes(1)
        expect(removeShadowRootSpy).toHaveBeenCalledOnceWith(shadowRoot)
      })

      it('should call removeShadowRoot when removing a host containing other hosts in its children', () => {
        const parentHost = appendElement('<div id="host"><p></p></div>', sandbox)
        const parentShadowRoot = parentHost.attachShadow({ mode: 'open' })
        const childHost = appendElement('<span></span>', parentHost.querySelector('p')!)
        const childShadowRoot = childHost.attachShadow({ mode: 'open' })

        const scope = getRecordingScope()
        const serializedDocument = takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        parentHost.remove()
        mutationTracker.flush()
        expect(emitRecordCallback).toHaveBeenCalledTimes(1)
        expect(addShadowRootSpy).toHaveBeenCalledTimes(2)

        const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
        validate(getLatestMutationPayload(), {
          removes: [
            {
              parent: expectInitialNode({ idAttribute: 'sandbox' }),
              node: expectInitialNode({ idAttribute: 'host' }),
            },
          ],
        })
        expect(addShadowRootSpy).toHaveBeenCalledTimes(2)
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
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      textNode.data = 'bar'
      mutationTracker.flush()

      expect(emitRecordCallback).toHaveBeenCalledTimes(1)

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

      const scope = getRecordingScope()
      takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      textNode.data = 'bar'
      mutationTracker.flush()

      expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    })

    it('does not emit a mutation when a text node keeps the same value', () => {
      const scope = getRecordingScope()
      takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      textNode.data = 'bar'
      textNode.data = 'foo'
      mutationTracker.flush()

      expect(emitRecordCallback).not.toHaveBeenCalled()
    })

    it('respects the default privacy level setting', () => {
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)

      scope.configuration.defaultPrivacyLevel = DefaultPrivacyLevel.MASK
      const mutationTracker = startMutationCollection(scope)

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

      const scope = getRecordingScope(DefaultPrivacyLevel.MASK)
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      div.firstChild!.textContent = 'bazz 7'
      mutationTracker.flush()

      expect(emitRecordCallback).toHaveBeenCalledTimes(1)

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
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      sandbox.setAttribute('foo', 'bar')
      mutationTracker.flush()

      expect(emitRecordCallback).toHaveBeenCalledTimes(1)

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
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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

      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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

      const scope = getRecordingScope()
      takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      sandbox.setAttribute('foo', 'biz')
      sandbox.setAttribute('foo', 'bar')
      mutationTracker.flush()

      expect(emitRecordCallback).not.toHaveBeenCalled()
    })

    it('reuse the same mutation when multiple attributes are changed', () => {
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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
      const scope = getRecordingScope(DefaultPrivacyLevel.MASK)
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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
      const scope = getRecordingScope()
      const serializedDocument = takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

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

        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        sandbox.appendChild(ignoredElement)

        mutationTracker.flush()

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when changing the attributes of an ignored node', () => {
        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        ignoredElement.setAttribute('foo', 'bar')

        mutationTracker.flush()

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when adding a new child node', () => {
        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        appendElement("'function foo() {}'", ignoredElement)

        mutationTracker.flush()

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = appendText('function foo() {}', sandbox)

        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)

        ignoredElement.appendChild(textNode)

        const mutationTracker = startMutationCollection(scope)

        textNode.data = 'function bar() {}'

        mutationTracker.flush()

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when adding a known child node', () => {
        const textNode = appendText('function foo() {}', sandbox)

        const scope = getRecordingScope()
        const serializedDocument = takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

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

        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        sandbox.appendChild(script)
        mutationTracker.flush()

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })
    })
  })

  describe('hidden nodes', () => {
    let hiddenElement: HTMLElement
    beforeEach(() => {
      hiddenElement = appendElement("<div data-dd-privacy='hidden'></div>", sandbox)
    })

    it('does not emit attribute mutations on hidden nodes', () => {
      const scope = getRecordingScope()
      takeFullSnapshotForTesting(scope)
      const mutationTracker = startMutationCollection(scope)

      hiddenElement.setAttribute('foo', 'bar')

      mutationTracker.flush()

      expect(emitRecordCallback).not.toHaveBeenCalled()
    })

    describe('does not emit mutations occurring in hidden node', () => {
      it('when adding a new node', () => {
        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

        appendElement('function foo() {}', hiddenElement)

        mutationTracker.flush()

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = appendText('function foo() {}', sandbox)

        const scope = getRecordingScope()
        takeFullSnapshotForTesting(scope)

        hiddenElement.appendChild(textNode)

        const mutationTracker = startMutationCollection(scope)

        textNode.data = 'function bar() {}'

        mutationTracker.flush()

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when moving a known node into an hidden node', () => {
        const textNode = appendText('function foo() {}', sandbox)

        const scope = getRecordingScope()
        const serializedDocument = takeFullSnapshotForTesting(scope)
        const mutationTracker = startMutationCollection(scope)

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

          const scope = getRecordingScope()
          const serializedDocument = takeFullSnapshotForTesting(scope)
          const mutationTracker = startMutationCollection(scope)

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

          const scope = getRecordingScope()
          const serializedDocument = takeFullSnapshotForTesting(scope)
          const mutationTracker = startMutationCollection(scope)

          input.setAttribute('value', 'bar')
          mutationTracker.flush()

          if (expectedAttributesMutation) {
            const { validate, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
            validate(getLatestMutationPayload(), {
              attributes: [{ node: expectInitialNode({ tag: 'input' }), attributes: expectedAttributesMutation }],
            })
          } else {
            expect(emitRecordCallback).not.toHaveBeenCalled()
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

describe('idsAreAssignedForNodeAndAncestors', () => {
  let scope: RecordingScope

  beforeEach(() => {
    scope = createRecordingScopeForTesting()
  })

  it('returns false for DOM Nodes that have not been assigned an id', () => {
    expect(idsAreAssignedForNodeAndAncestors(document.createElement('div'), scope.nodeIds)).toBe(false)
  })

  it('returns true for DOM Nodes that have been assigned an id', () => {
    const node = document.createElement('div')
    scope.nodeIds.getOrInsert(node)
    expect(idsAreAssignedForNodeAndAncestors(node, scope.nodeIds)).toBe(true)
  })

  it('returns false for DOM Nodes when an ancestor has not been assigned an id', () => {
    const node = document.createElement('div')
    scope.nodeIds.getOrInsert(node)

    const parent = document.createElement('div')
    parent.appendChild(node)
    scope.nodeIds.getOrInsert(parent)

    const grandparent = document.createElement('div')
    grandparent.appendChild(parent)

    expect(idsAreAssignedForNodeAndAncestors(node, scope.nodeIds)).toBe(false)
  })

  it('returns true for DOM Nodes when all ancestors have been assigned an id', () => {
    const node = document.createElement('div')
    scope.nodeIds.getOrInsert(node)

    const parent = document.createElement('div')
    parent.appendChild(node)
    scope.nodeIds.getOrInsert(parent)

    const grandparent = document.createElement('div')
    grandparent.appendChild(parent)
    scope.nodeIds.getOrInsert(grandparent)

    expect(idsAreAssignedForNodeAndAncestors(node, scope.nodeIds)).toBe(true)
  })

  it('returns true for DOM Nodes in shadow subtrees', () => {
    const node = document.createElement('div')
    scope.nodeIds.getOrInsert(node)

    const parent = document.createElement('div')
    parent.appendChild(node)
    scope.nodeIds.getOrInsert(parent)

    const grandparent = document.createElement('div')
    const shadowRoot = grandparent.attachShadow({ mode: 'open' })
    shadowRoot.appendChild(parent)
    scope.nodeIds.getOrInsert(grandparent)

    expect(idsAreAssignedForNodeAndAncestors(node, scope.nodeIds)).toBe(true)
  })
})
