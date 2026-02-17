import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
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
  DocumentNode,
  SerializedNodeWithId,
} from '../../../types'
import { NodeType } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import type { AddShadowRootCallBack, RemoveShadowRootCallBack } from '../shadowRootsController'
import { appendElement, appendText } from '../../../../../rum-core/test'
import type { EmitRecordCallback, EmitStatsCallback } from '../record.types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { serializeMutations } from '../serialization'
import { trackMutation } from './trackMutation'
import type { MutationTracker } from './trackMutation'

describe('trackMutation', () => {
  let sandbox: HTMLElement

  let addShadowRootSpy: Mock<AddShadowRootCallBack>
  let removeShadowRootSpy: Mock<RemoveShadowRootCallBack>
  let emitRecordCallback: Mock<EmitRecordCallback>
  let emitStatsCallback: Mock<EmitStatsCallback>

  beforeEach(() => {
    sandbox = appendElement('<div id="sandbox"></div>')

    addShadowRootSpy = vi.fn()
    removeShadowRootSpy = vi.fn()
    emitRecordCallback = vi.fn()
    emitStatsCallback = vi.fn()
  })

  function getRecordingScope(defaultPrivacyLevel: DefaultPrivacyLevel = DefaultPrivacyLevel.ALLOW): RecordingScope {
    return createRecordingScopeForTesting({
      configuration: { defaultPrivacyLevel },
      addShadowRoot: addShadowRootSpy,
      removeShadowRoot: removeShadowRootSpy,
    })
  }

  function getLatestMutationPayload(): BrowserMutationPayload {
    const latestRecord = emitRecordCallback.mock.lastCall?.[0] as BrowserIncrementalSnapshotRecord
    return latestRecord.data as BrowserMutationPayload
  }

  function recordMutation(
    mutation: () => void,
    options: {
      mutationBeforeTrackingStarts?: () => void
      scope?: RecordingScope
      skipFlush?: boolean
    } = {}
  ): {
    mutationTracker: MutationTracker
    serializedDocument: DocumentNode & SerializedNodeWithId
  } {
    const scope = options.scope || getRecordingScope()

    const serializedDocument = takeFullSnapshotForTesting(scope)

    if (options.mutationBeforeTrackingStarts) {
      options.mutationBeforeTrackingStarts()
    }

    const mutationTracker = trackMutation(document, emitRecordCallback, emitStatsCallback, scope, serializeMutations)
    registerCleanupTask(() => {
      mutationTracker.stop()
    })

    mutation()

    if (!options.skipFlush) {
      mutationTracker.flush()
    }

    return { mutationTracker, serializedDocument }
  }

  describe('childList mutation records', () => {
    it('emits a mutation when a node is appended to a known node', () => {
      const { serializedDocument } = recordMutation(() => {
        appendElement('<div></div>', sandbox)
      })
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

    it('emits add node mutations in the expected order', () => {
      const a = appendElement('<a></a>', sandbox)
      const aa = appendElement('<aa></aa>', a)
      const b = appendElement('<b></b>', sandbox)
      const bb = appendElement('<bb></bb>', b)
      const c = appendElement('<c></c>', sandbox)
      const cc = appendElement('<cc></cc>', c)

      const { serializedDocument } = recordMutation(() => {
        const ab = document.createElement('ab')
        const ac = document.createElement('ac')
        const ba = document.createElement('ba')
        const bc = document.createElement('bc')
        const ca = document.createElement('ca')
        const cb = document.createElement('cb')

        cc.before(cb)
        aa.after(ac)
        bb.before(ba)
        aa.after(ab)
        cb.before(ca)
        bb.after(bc)
      })
      expect(emitRecordCallback).toHaveBeenCalledTimes(1)

      const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidator(serializedDocument)
      const cb = expectNewNode({ type: NodeType.Element, tagName: 'cb' })
      const ca = expectNewNode({ type: NodeType.Element, tagName: 'ca' })
      const bc = expectNewNode({ type: NodeType.Element, tagName: 'bc' })
      const ba = expectNewNode({ type: NodeType.Element, tagName: 'ba' })
      const ac = expectNewNode({ type: NodeType.Element, tagName: 'ac' })
      const ab = expectNewNode({ type: NodeType.Element, tagName: 'ab' })
      validate(getLatestMutationPayload(), {
        adds: [
          {
            parent: expectInitialNode({ tag: 'c' }),
            node: cb,
            next: expectInitialNode({ tag: 'cc' }),
          },
          {
            parent: expectInitialNode({ tag: 'c' }),
            node: ca,
            next: cb,
          },
          {
            parent: expectInitialNode({ tag: 'b' }),
            node: bc,
          },
          {
            parent: expectInitialNode({ tag: 'b' }),
            node: ba,
            next: expectInitialNode({ tag: 'bb' }),
          },
          {
            parent: expectInitialNode({ tag: 'a' }),
            node: ac,
          },
          {
            parent: expectInitialNode({ tag: 'a' }),
            node: ab,
            next: ac,
          },
        ],
      })
    })

    it('emits serialization stats with mutations', () => {
      const cssText = 'body { width: 100%; }'

      const { serializedDocument } = recordMutation(() => {
        appendElement(`<style>${cssText}</style>`, sandbox)
      })

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

      expect(emitStatsCallback.mock.lastCall[0]).toEqual({
        cssText: { count: 1, max: 21, sum: 21 },
        serializationDuration: expect.anything(),
      })
    })

    it('processes mutations asynchronously', async () => {
      recordMutation(
        () => {
          appendElement('<div></div>', sandbox)
        },
        { skipFlush: true }
      )

      expect(emitRecordCallback).not.toHaveBeenCalled()

      await collectAsyncCalls(emitRecordCallback)
    })

    it('does not emit a mutation when a node is appended to a unknown node', () => {
      const unknownNode = document.createElement('div')
      registerCleanupTask(() => {
        unknownNode.remove()
      })

      recordMutation(
        () => {
          appendElement('<div></div>', unknownNode)
        },
        {
          mutationBeforeTrackingStarts() {
            // Append the node after the full snapshot, but before tracking starts,
            // rendering it 'unknown'.
            sandbox.appendChild(unknownNode)
          },
        }
      )

      expect(emitRecordCallback).not.toHaveBeenCalled()
    })

    it('emits buffered mutation records on flush', () => {
      const { mutationTracker } = recordMutation(
        () => {
          appendElement('<div></div>', sandbox)
        },
        {
          skipFlush: true,
        }
      )

      expect(emitRecordCallback).toHaveBeenCalledTimes(0)

      mutationTracker.flush()
      expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    })

    describe('does not emit mutations on removed nodes and their descendants', () => {
      it('attribute mutations', () => {
        const element = appendElement('<div></div>', sandbox)

        recordMutation(() => {
          element.setAttribute('foo', 'bar')
          sandbox.remove()
        })

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = appendText('text', sandbox)

        recordMutation(() => {
          textNode.data = 'bar'
          sandbox.remove()
        })

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        recordMutation(() => {
          appendElement('<div><hr /></div>', sandbox)
          sandbox.remove()
        })

        expect(getLatestMutationPayload().adds).toEqual([])
      })

      it('remove mutations', () => {
        const element = appendElement('<div></div>', sandbox)

        const { serializedDocument } = recordMutation(() => {
          element.remove()
          sandbox.remove()
        })

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

        recordMutation(() => {
          element.remove()
          sandbox.appendChild(element)
          element.setAttribute('foo', 'bar')
        })

        expect(getLatestMutationPayload().attributes).toEqual([])
      })

      it('text mutations', () => {
        const textNode = appendText('foo', sandbox)

        recordMutation(() => {
          textNode.remove()
          sandbox.appendChild(textNode)
          textNode.data = 'bar'
        })

        expect(getLatestMutationPayload().texts).toEqual([])
      })

      it('add mutations', () => {
        const child = appendElement('<a><b target/></a>', sandbox)
        const parent = child.parentElement!

        const { serializedDocument } = recordMutation(() => {
          // Generate a mutation on 'child'
          child.remove()
          parent.appendChild(child)
          // Generate a mutation on 'parent'
          parent.remove()
          sandbox.appendChild(parent)
        })

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
        const { serializedDocument } = recordMutation(() => {
          const child = appendElement('<a><b target/></a>', sandbox)
          child.remove()
        })

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
      const { serializedDocument } = recordMutation(() => {
        const element = appendElement('<a></a>', sandbox)
        element.remove()
        sandbox.appendChild(element)
      })

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

      const { serializedDocument } = recordMutation(() => {
        // Moves 'a' after 'b'
        sandbox.appendChild(a)
      })

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

      const { serializedDocument } = recordMutation(() => {
        a.appendChild(span)
        b.appendChild(span)
      })

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
      const { serializedDocument } = recordMutation(() => {
        appendElement('<a></a><b></b><c></c>', sandbox)
      })

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
      const { serializedDocument } = recordMutation(
        () => {
          sandbox.innerText = 'foo bar'
        },
        { scope: getRecordingScope(DefaultPrivacyLevel.MASK) }
      )

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
        let shadowRoot: ShadowRoot
        const { serializedDocument } = recordMutation(() => {
          const host = appendElement('<div></div>', sandbox)
          shadowRoot = host.attachShadow({ mode: 'open' })
          appendElement('<span></span>', shadowRoot)
        })

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
        expect(addShadowRootSpy).toHaveBeenCalledTimes(1)
        expect(addShadowRootSpy).toHaveBeenCalledWith(shadowRoot, expect.anything())
        expect(removeShadowRootSpy).not.toHaveBeenCalled()
      })

      it('should call removeShadowRoot when host is removed', () => {
        const host = appendElement('<div id="host"></div>', sandbox)
        const shadowRoot = host.attachShadow({ mode: 'open' })
        appendElement('<span></span>', shadowRoot)

        const { serializedDocument } = recordMutation(() => {
          host.remove()
        })

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
        expect(removeShadowRootSpy).toHaveBeenCalledTimes(1)
        expect(removeShadowRootSpy).toHaveBeenCalledWith(shadowRoot)
      })

      it('should call removeShadowRoot when parent of host is removed', () => {
        const host = appendElement('<div id="parent"><div id="host" target></div></div>', sandbox)
        const shadowRoot = host.attachShadow({ mode: 'open' })
        appendElement('<span></span>', shadowRoot)

        const { serializedDocument } = recordMutation(() => {
          host.parentElement!.remove()
        })

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
        expect(removeShadowRootSpy).toHaveBeenCalledTimes(1)
        expect(removeShadowRootSpy).toHaveBeenCalledWith(shadowRoot)
      })

      it('should call removeShadowRoot when removing a host containing other hosts in its children', () => {
        const parentHost = appendElement('<div id="host"><p></p></div>', sandbox)
        const parentShadowRoot = parentHost.attachShadow({ mode: 'open' })
        const childHost = appendElement('<span></span>', parentHost.querySelector('p')!)
        const childShadowRoot = childHost.attachShadow({ mode: 'open' })

        const { serializedDocument } = recordMutation(() => {
          parentHost.remove()
        })

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
        expect(removeShadowRootSpy.mock.calls[0][0]).toBe(parentShadowRoot)
        expect(removeShadowRootSpy.mock.calls[1][0]).toBe(childShadowRoot)
      })
    })
  })

  describe('characterData mutations', () => {
    let textNode: Text

    beforeEach(() => {
      textNode = appendText('foo', sandbox)
    })

    it('emits a mutation when a text node is changed', () => {
      const { serializedDocument } = recordMutation(() => {
        textNode.data = 'bar'
      })

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

      recordMutation(() => {
        textNode.data = 'bar'
      })

      expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    })

    it('does not emit a mutation when a text node keeps the same value', () => {
      recordMutation(() => {
        textNode.data = 'bar'
        textNode.data = 'foo'
      })

      expect(emitRecordCallback).not.toHaveBeenCalled()
    })

    it('respects the default privacy level setting', () => {
      const scope = getRecordingScope()
      const { serializedDocument } = recordMutation(
        () => {
          scope.configuration.defaultPrivacyLevel = DefaultPrivacyLevel.MASK
          textNode.data = 'foo bar'
        },
        { scope }
      )

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

      const { serializedDocument } = recordMutation(
        () => {
          div.firstChild!.textContent = 'bazz 7'
        },
        { scope: getRecordingScope(DefaultPrivacyLevel.MASK) }
      )

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
      const { serializedDocument } = recordMutation(() => {
        sandbox.setAttribute('foo', 'bar')
      })

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
      const { serializedDocument } = recordMutation(() => {
        sandbox.setAttribute('foo', '')
      })

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

      const { serializedDocument } = recordMutation(() => {
        sandbox.removeAttribute('foo')
      })

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

      recordMutation(() => {
        sandbox.setAttribute('foo', 'biz')
        sandbox.setAttribute('foo', 'bar')
      })

      expect(emitRecordCallback).not.toHaveBeenCalled()
    })

    it('reuse the same mutation when multiple attributes are changed', () => {
      const { serializedDocument } = recordMutation(() => {
        sandbox.setAttribute('foo1', 'biz')
        sandbox.setAttribute('foo2', 'bar')
      })

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
      const { serializedDocument } = recordMutation(
        () => {
          sandbox.setAttribute('data-foo', 'biz')
        },
        { scope: getRecordingScope(DefaultPrivacyLevel.MASK) }
      )

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
      const { serializedDocument } = recordMutation(() => {
        sandbox.insertBefore(document.createElement('a'), ignoredElement)
      })

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

        recordMutation(() => {
          sandbox.appendChild(ignoredElement)
        })

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when changing the attributes of an ignored node', () => {
        recordMutation(() => {
          ignoredElement.setAttribute('foo', 'bar')
        })

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when adding a new child node', () => {
        recordMutation(() => {
          appendElement("'function foo() {}'", ignoredElement)
        })

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = appendText('function foo() {}', sandbox)
        ignoredElement.appendChild(textNode)

        recordMutation(() => {
          textNode.data = 'function bar() {}'
        })

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when adding a known child node', () => {
        const textNode = appendText('function foo() {}', sandbox)

        const { serializedDocument } = recordMutation(() => {
          ignoredElement.appendChild(textNode)
        })

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

        recordMutation(() => {
          sandbox.appendChild(script)
        })

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
      recordMutation(() => {
        hiddenElement.setAttribute('foo', 'bar')
      })

      expect(emitRecordCallback).not.toHaveBeenCalled()
    })

    describe('does not emit mutations occurring in hidden node', () => {
      it('when adding a new node', () => {
        recordMutation(() => {
          appendElement('function foo() {}', hiddenElement)
        })

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when mutating a known child node', () => {
        const textNode = appendText('function foo() {}', sandbox)
        hiddenElement.appendChild(textNode)

        recordMutation(() => {
          textNode.data = 'function bar() {}'
        })

        expect(emitRecordCallback).not.toHaveBeenCalled()
      })

      it('when moving a known node into an hidden node', () => {
        const textNode = appendText('function foo() {}', sandbox)

        const { serializedDocument } = recordMutation(() => {
          hiddenElement.appendChild(textNode)
        })

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

          const { serializedDocument } = recordMutation(() => {
            sandbox.appendChild(input)
          })

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

          const { serializedDocument } = recordMutation(() => {
            input.setAttribute('value', 'bar')
          })

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
