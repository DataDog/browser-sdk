import { DefaultPrivacyLevel } from '@datadog/browser-core'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import {
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
} from '@datadog/browser-rum-core'
import type { BrowserChangeRecord, BrowserFullSnapshotChangeRecord, BrowserRecord } from '../../../types'
import { ChangeType } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import type { AddShadowRootCallBack, RemoveShadowRootCallBack } from '../shadowRootsController'
import type { ChangeDecoder, SerializationStats } from '../serialization'
import { aggregateSerializationStats, createSerializationStats } from '../serialization'
import { serializeHtmlAsChange } from '../test/serializeHtml.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackMutation } from './trackMutation'

describe('trackMutation', () => {
  async function recordMutationOf(
    initialContent: string,
    mutation: (sandbox: HTMLElement) => void,
    options: {
      configuration?: Partial<RumConfiguration>
      beforeFullSnapshot?: (sandbox: HTMLElement, scope: RecordingScope) => void
      beforeTrackingMutations?: (sandbox: HTMLElement) => void
      scope?: RecordingScope
    } = {}
  ): Promise<{
    fullSnapshot: BrowserChangeRecord | BrowserFullSnapshotChangeRecord
    mutation?: BrowserChangeRecord
    stats: SerializationStats
  }> {
    const emittedMutations: BrowserChangeRecord[] = []
    const emittedStats = createSerializationStats()

    const fullSnapshot = await serializeHtmlAsChange(initialContent, {
      scope: options.scope ?? createRecordingScopeForTesting({ configuration: options.configuration }),
      before(target: Node, scope: RecordingScope): void {
        const sandbox = target as HTMLElement
        options.beforeFullSnapshot?.(sandbox, scope)
      },
      after(target: Node, scope: RecordingScope, stats: SerializationStats, decoder: ChangeDecoder): void {
        const sandbox = target as HTMLElement

        options.beforeTrackingMutations?.(sandbox)

        const emitRecord = (record: BrowserRecord): void => {
          emittedMutations.push(decoder.decode(record as BrowserChangeRecord))
        }

        const emitStats = (stats: SerializationStats): void => {
          aggregateSerializationStats(emittedStats, stats)
        }
        emitStats(stats)

        const mutationTracker = trackMutation(sandbox.ownerDocument, emitRecord, emitStats, scope)
        registerCleanupTask(() => {
          mutationTracker.stop()
        })

        mutation(sandbox)

        mutationTracker.flush()
      },
    })

    if (!fullSnapshot) {
      throw new Error('Expected a full snapshot to be recorded')
    }
    if (emittedMutations.length > 1) {
      throw new Error(`Expected zero or one mutations, but ${emittedMutations.length} were recorded`)
    }

    return { fullSnapshot, mutation: emittedMutations[0], stats: emittedStats }
  }

  describe('childList mutation records', () => {
    it('emits a mutation when a node is appended to a known node', async () => {
      const { fullSnapshot, mutation } = await recordMutationOf('<div>', (sandbox: HTMLElement): void => {
        const document = sandbox.ownerDocument
        sandbox.appendChild(document.createElement('span'))
      })
      expect(fullSnapshot.data).toEqual([[ChangeType.AddNode, [null, 'DIV']]])
      expect(mutation?.data).toEqual([[ChangeType.AddNode, [1, 'SPAN']]])
    })

    it('emits add node mutations in the expected order', async () => {
      const { fullSnapshot, mutation } = await recordMutationOf(
        `<div>
          <a><aa></aa></a>
          <b><bb></bb></b>
          <c><cc></cc></c>
        </div>`,
        (sandbox: HTMLElement): void => {
          const document = sandbox.ownerDocument
          const [aa] = document.getElementsByTagName('aa')
          const [bb] = document.getElementsByTagName('bb')
          const [cc] = document.getElementsByTagName('cc')

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
        }
      )
      expect(fullSnapshot.data).toEqual([
        [ChangeType.AddNode, [null, 'DIV'], [1, 'A'], [1, 'AA'], [3, 'B'], [1, 'BB'], [5, 'C'], [1, 'CC']],
      ])
      expect(mutation?.data).toEqual([
        [ChangeType.AddNode, [-1, 'CB'], [7, 'AC'], [-5, 'BA'], [-2, 'AB'], [-4, 'CA'], [9, 'BC']],
      ])
    })

    it('emits serialization stats with mutations', async () => {
      const cssText = 'body { width: 100%; }'

      const { mutation, stats } = await recordMutationOf('<div>', (sandbox: HTMLElement): void => {
        const document = sandbox.ownerDocument
        const style = document.createElement('style')
        style.textContent = cssText
        sandbox.appendChild(style)
      })
      expect(mutation?.data).toEqual([
        [ChangeType.AddNode, [1, 'STYLE']],
        [ChangeType.AddStyleSheet, [cssText]],
        [ChangeType.AttachedStyleSheets, [1, 0]],
      ])
      expect(stats).toEqual({
        cssText: { count: 1, max: 21, sum: 21 },
        serializationDuration: jasmine.anything(),
      })
    })

    it('does not emit a mutation when a node is appended to an unknown node', async () => {
      let unknownNode!: HTMLElement
      const { mutation } = await recordMutationOf(
        '<div>',
        (sandbox: HTMLElement): void => {
          unknownNode.appendChild(sandbox.ownerDocument.createElement('div'))
        },
        {
          beforeTrackingMutations(sandbox: HTMLElement): void {
            unknownNode = sandbox.ownerDocument.createElement('div')
            // Append the node after the full snapshot, but before tracking starts,
            // rendering it 'unknown'.
            sandbox.appendChild(unknownNode)
          },
        }
      )
      expect(mutation).toBeUndefined()
    })

    describe('does not emit mutations on removed nodes and their descendants', () => {
      it('attribute mutations', async () => {
        const { mutation } = await recordMutationOf('<div><span></span></div>', (sandbox: HTMLElement): void => {
          ;(sandbox.firstElementChild as HTMLElement).setAttribute('foo', 'bar')
          sandbox.remove()
        })
        // The setAttribute on the descendant is filtered out; the only change is the
        // removal of the sandbox itself.
        expect(mutation?.data).toEqual([[ChangeType.RemoveNode, 0]])
      })

      it('text mutations', async () => {
        const { mutation } = await recordMutationOf('<div>text</div>', (sandbox: HTMLElement): void => {
          ;(sandbox.firstChild as Text).data = 'bar'
          sandbox.remove()
        })
        // The text change on the descendant is filtered out; the only change is the
        // removal of the sandbox itself.
        expect(mutation?.data).toEqual([[ChangeType.RemoveNode, 0]])
      })

      it('add mutations', async () => {
        const { mutation } = await recordMutationOf('<div></div>', (sandbox: HTMLElement): void => {
          const document = sandbox.ownerDocument
          const div = document.createElement('div')
          div.appendChild(document.createElement('hr'))
          sandbox.appendChild(div)
          sandbox.remove()
        })
        // The newly added subtree is filtered out; the only change is the removal of
        // the sandbox itself.
        expect(mutation?.data).toEqual([[ChangeType.RemoveNode, 0]])
      })

      it('remove mutations', async () => {
        const { mutation } = await recordMutationOf('<div><div></div></div>', (sandbox: HTMLElement): void => {
          sandbox.firstElementChild!.remove()
          sandbox.remove()
        })
        // The active removal of the descendant is recorded alongside the removal of
        // the sandbox itself, but no other changes are emitted.
        expect(mutation?.data).toEqual([[ChangeType.RemoveNode, 1, 0]])
      })
    })

    describe('does not emit mutations on freshly re-serialized nodes and their descendants', () => {
      // Note about those tests: any mutation with a not-yet-serialized 'target' will be trivially
      // ignored. We want to focus on mutations with a 'target' that have already been serialized
      // (during the document serialization for example), and re-serialized (by being added in the
      // document) during the processed mutation batched.

      it('attribute mutations', async () => {
        const { mutation } = await recordMutationOf('<div><div></div></div>', (sandbox: HTMLElement): void => {
          const element = sandbox.firstElementChild as HTMLElement
          element.remove()
          sandbox.appendChild(element)
          element.setAttribute('foo', 'bar')
        })
        // The attribute change is captured inline in the fresh AddNode for the
        // re-serialized element rather than as a separate Attribute change.
        expect(mutation?.data).toEqual([
          [ChangeType.AddNode, [2, 'DIV', ['foo', 'bar']]],
          [ChangeType.RemoveNode, 1],
        ])
      })

      it('text mutations', async () => {
        const { mutation } = await recordMutationOf('<div>foo</div>', (sandbox: HTMLElement): void => {
          const textNode = sandbox.firstChild as Text
          textNode.remove()
          sandbox.appendChild(textNode)
          textNode.data = 'bar'
        })
        // The text change is captured inline in the fresh AddNode for the re-serialized
        // text node rather than as a separate Text change.
        expect(mutation?.data).toEqual([
          [ChangeType.AddNode, [2, '#text', 'bar']],
          [ChangeType.RemoveNode, 1],
        ])
      })

      it('add mutations', async () => {
        const { mutation } = await recordMutationOf('<div><a><b></b></a></div>', (sandbox: HTMLElement): void => {
          const a = sandbox.firstElementChild as HTMLElement
          const b = a.firstElementChild as HTMLElement
          // Generate a mutation on 'b' (child)
          b.remove()
          a.appendChild(b)
          // Generate a mutation on 'a' (parent)
          a.remove()
          sandbox.appendChild(a)
        })
        // Even though the mutation on 'b' comes first, only the 'a' re-serialization is
        // emitted, since it embeds an up-to-date serialization of 'a' (with 'b' inside).
        expect(mutation?.data).toEqual([
          [ChangeType.AddNode, [3, 'A'], [1, 'B']],
          [ChangeType.RemoveNode, 2, 1],
        ])
      })

      it('remove mutations', async () => {
        const { mutation } = await recordMutationOf('<div></div>', (sandbox: HTMLElement): void => {
          const document = sandbox.ownerDocument
          const a = document.createElement('a')
          a.appendChild(document.createElement('b'))
          sandbox.appendChild(a)
          a.firstElementChild!.remove()
        })
        // 'b' is added then removed within the same batch and never serialized, so the
        // only change is the AddNode for 'a' with no children.
        expect(mutation?.data).toEqual([[ChangeType.AddNode, [1, 'A']]])
      })
    })

    it('emits only an "add" mutation when adding, removing then re-adding a child', async () => {
      const { mutation } = await recordMutationOf('<div></div>', (sandbox: HTMLElement): void => {
        const element = sandbox.ownerDocument.createElement('a')
        sandbox.appendChild(element)
        element.remove()
        sandbox.appendChild(element)
      })
      expect(mutation?.data).toEqual([[ChangeType.AddNode, [1, 'A']]])
    })

    it('emits an "add" and a "remove" mutation when moving a node', async () => {
      const { mutation } = await recordMutationOf('<div><a></a><b></b></div>', (sandbox: HTMLElement): void => {
        // Moves 'a' after 'b'
        sandbox.appendChild(sandbox.firstElementChild!)
      })
      expect(mutation?.data).toEqual([
        [ChangeType.AddNode, [3, 'A']],
        [ChangeType.RemoveNode, 1],
      ])
    })

    it('emits only one remove when removing a node from multiple places', async () => {
      const { mutation } = await recordMutationOf(
        '<div><span></span><a></a><b></b></div>',
        (sandbox: HTMLElement): void => {
          const span = sandbox.querySelector('span')!
          const a = sandbox.querySelector('a')!
          const b = sandbox.querySelector('b')!
          a.appendChild(span)
          b.appendChild(span)
        }
      )
      expect(mutation?.data).toEqual([
        [ChangeType.AddNode, [1, 'SPAN']],
        [ChangeType.RemoveNode, 1],
      ])
    })

    it('keep node order when adding multiple sibling nodes', async () => {
      const { mutation } = await recordMutationOf('<div></div>', (sandbox: HTMLElement): void => {
        const document = sandbox.ownerDocument
        sandbox.appendChild(document.createElement('a'))
        sandbox.appendChild(document.createElement('b'))
        sandbox.appendChild(document.createElement('c'))
      })
      expect(mutation?.data).toEqual([[ChangeType.AddNode, [1, 'A'], [2, 'B'], [3, 'C']]])
    })

    it('respects the default privacy level setting', async () => {
      const { mutation } = await recordMutationOf(
        '<div></div>',
        (sandbox: HTMLElement): void => {
          sandbox.innerText = 'foo bar'
        },
        { configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.MASK } }
      )
      expect(mutation?.data).toEqual([[ChangeType.AddNode, [1, '#text', 'xxx xxx']]])
    })

    describe('for shadow DOM', () => {
      let addShadowRootSpy: jasmine.Spy<AddShadowRootCallBack>
      let removeShadowRootSpy: jasmine.Spy<RemoveShadowRootCallBack>
      let scope: RecordingScope

      beforeEach(() => {
        addShadowRootSpy = jasmine.createSpy()
        removeShadowRootSpy = jasmine.createSpy()
        scope = createRecordingScopeForTesting({
          addShadowRoot: addShadowRootSpy,
          removeShadowRoot: removeShadowRootSpy,
        })
      })

      it('should call addShadowRoot when host is added', async () => {
        let shadowRoot!: ShadowRoot
        const { mutation } = await recordMutationOf(
          '<div></div>',
          (sandbox: HTMLElement): void => {
            const document = sandbox.ownerDocument
            const host = document.createElement('div')
            sandbox.appendChild(host)
            shadowRoot = host.attachShadow({ mode: 'open' })
            shadowRoot.appendChild(document.createElement('span'))
          },
          { scope }
        )

        expect(mutation?.data).toEqual([[ChangeType.AddNode, [1, 'DIV'], [1, '#shadow-root'], [1, 'SPAN']]])
        expect(addShadowRootSpy).toHaveBeenCalledOnceWith(shadowRoot, jasmine.anything())
        expect(removeShadowRootSpy).not.toHaveBeenCalled()
      })

      it('should call removeShadowRoot when host is removed', async () => {
        let shadowRoot!: ShadowRoot
        const { mutation } = await recordMutationOf(
          '<div><div id="host"></div></div>',
          (sandbox: HTMLElement): void => {
            sandbox.querySelector('#host')!.remove()
          },
          {
            scope,
            beforeFullSnapshot(sandbox: HTMLElement): void {
              const host = sandbox.querySelector('#host') as HTMLElement
              shadowRoot = host.attachShadow({ mode: 'open' })
              shadowRoot.appendChild(sandbox.ownerDocument.createElement('span'))
            },
          }
        )

        expect(mutation?.data).toEqual([[ChangeType.RemoveNode, 1]])
        expect(addShadowRootSpy).toHaveBeenCalledTimes(1)
        expect(removeShadowRootSpy).toHaveBeenCalledOnceWith(shadowRoot)
      })

      it('should call removeShadowRoot when parent of host is removed', async () => {
        let shadowRoot!: ShadowRoot
        const { mutation } = await recordMutationOf(
          '<div><div id="parent"><div id="host"></div></div></div>',
          (sandbox: HTMLElement): void => {
            sandbox.querySelector('#parent')!.remove()
          },
          {
            scope,
            beforeFullSnapshot(sandbox: HTMLElement): void {
              const host = sandbox.querySelector('#host') as HTMLElement
              shadowRoot = host.attachShadow({ mode: 'open' })
              shadowRoot.appendChild(sandbox.ownerDocument.createElement('span'))
            },
          }
        )

        expect(mutation?.data).toEqual([[ChangeType.RemoveNode, 1]])
        expect(addShadowRootSpy).toHaveBeenCalledTimes(1)
        expect(removeShadowRootSpy).toHaveBeenCalledOnceWith(shadowRoot)
      })

      it('should call removeShadowRoot when removing a host containing other hosts in its children', async () => {
        let parentShadowRoot!: ShadowRoot
        let childShadowRoot!: ShadowRoot
        const { mutation } = await recordMutationOf(
          '<div><div id="host"><p></p></div></div>',
          (sandbox: HTMLElement): void => {
            sandbox.querySelector('#host')!.remove()
          },
          {
            scope,
            beforeFullSnapshot(sandbox: HTMLElement): void {
              const document = sandbox.ownerDocument
              const parentHost = sandbox.querySelector('#host') as HTMLElement
              parentShadowRoot = parentHost.attachShadow({ mode: 'open' })
              const childHost = document.createElement('span')
              parentHost.querySelector('p')!.appendChild(childHost)
              childShadowRoot = childHost.attachShadow({ mode: 'open' })
            },
          }
        )

        expect(mutation?.data).toEqual([[ChangeType.RemoveNode, 1]])
        expect(addShadowRootSpy).toHaveBeenCalledTimes(2)
        expect(removeShadowRootSpy).toHaveBeenCalledTimes(2)
        expect(removeShadowRootSpy.calls.argsFor(0)[0]).toBe(parentShadowRoot)
        expect(removeShadowRootSpy.calls.argsFor(1)[0]).toBe(childShadowRoot)
      })
    })
  })

  describe('characterData mutations', () => {
    it('emits a mutation when a text node is changed', async () => {
      const { mutation } = await recordMutationOf('<div>foo</div>', (sandbox: HTMLElement): void => {
        ;(sandbox.firstChild as Text).data = 'bar'
      })
      expect(mutation?.data).toEqual([[ChangeType.Text, [1, 'bar']]])
    })

    it('emits a mutation when an empty text node is changed', async () => {
      const { mutation } = await recordMutationOf(
        '<div>foo</div>',
        (sandbox: HTMLElement): void => {
          ;(sandbox.firstChild as Text).data = 'bar'
        },
        {
          beforeFullSnapshot(sandbox: HTMLElement): void {
            ;(sandbox.firstChild as Text).data = ''
          },
        }
      )
      expect(mutation?.data).toEqual([[ChangeType.Text, [1, 'bar']]])
    })

    it('does not emit a mutation when a text node keeps the same value', async () => {
      const { mutation } = await recordMutationOf('<div>foo</div>', (sandbox: HTMLElement): void => {
        const textNode = sandbox.firstChild as Text
        textNode.data = 'bar'
        textNode.data = 'foo'
      })
      expect(mutation).toBeUndefined()
    })

    it('respects the default privacy level setting', async () => {
      const scope = createRecordingScopeForTesting()
      const { mutation } = await recordMutationOf(
        '<div>foo</div>',
        (sandbox: HTMLElement): void => {
          scope.configuration.defaultPrivacyLevel = DefaultPrivacyLevel.MASK
          ;(sandbox.firstChild as Text).data = 'foo bar'
        },
        { scope }
      )
      expect(mutation?.data).toEqual([[ChangeType.Text, [1, 'xxx xxx']]])
    })

    it('respects the parent privacy level when emitting a text node mutation', async () => {
      const { mutation } = await recordMutationOf(
        '<div data-dd-privacy="allow"><div>foo 81</div></div>',
        (sandbox: HTMLElement): void => {
          sandbox.firstElementChild!.firstChild!.textContent = 'bazz 7'
        },
        { configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.MASK } }
      )
      // sandbox=0 (with data-dd-privacy="allow"), inner div=1, text=2.
      // sandbox's "allow" overrides the MASK default for its descendants.
      expect(mutation?.data).toEqual([[ChangeType.Text, [2, 'bazz 7']]])
    })
  })

  describe('attributes mutations', () => {
    it('emits a mutation when an attribute is changed', async () => {
      const { mutation } = await recordMutationOf('<div></div>', (sandbox: HTMLElement): void => {
        sandbox.setAttribute('foo', 'bar')
      })
      expect(mutation?.data).toEqual([[ChangeType.Attribute, [0, ['foo', 'bar']]]])
    })

    it('emits a mutation with an empty string when an attribute is changed to an empty string', async () => {
      const { mutation } = await recordMutationOf('<div></div>', (sandbox: HTMLElement): void => {
        sandbox.setAttribute('foo', '')
      })
      expect(mutation?.data).toEqual([[ChangeType.Attribute, [0, ['foo', '']]]])
    })

    it('emits an attribute deletion when an attribute is removed', async () => {
      const { mutation } = await recordMutationOf('<div foo="bar"></div>', (sandbox: HTMLElement): void => {
        sandbox.removeAttribute('foo')
      })
      // An attribute deletion is encoded as a single-element [name] tuple.
      expect(mutation?.data).toEqual([[ChangeType.Attribute, [0, ['foo']]]])
    })

    it('does not emit a mutation when an attribute keeps the same value', async () => {
      const { mutation } = await recordMutationOf('<div foo="bar"></div>', (sandbox: HTMLElement): void => {
        sandbox.setAttribute('foo', 'biz')
        sandbox.setAttribute('foo', 'bar')
      })
      expect(mutation).toBeUndefined()
    })

    it('reuses the same mutation when multiple attributes are changed', async () => {
      const { mutation } = await recordMutationOf('<div></div>', (sandbox: HTMLElement): void => {
        sandbox.setAttribute('foo1', 'biz')
        sandbox.setAttribute('foo2', 'bar')
      })
      expect(mutation?.data).toEqual([[ChangeType.Attribute, [0, ['foo1', 'biz'], ['foo2', 'bar']]]])
    })

    it('respects the default privacy level setting', async () => {
      const { mutation } = await recordMutationOf(
        '<div></div>',
        (sandbox: HTMLElement): void => {
          sandbox.setAttribute('data-foo', 'biz')
        },
        { configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.MASK } }
      )
      expect(mutation?.data).toEqual([[ChangeType.Attribute, [0, ['data-foo', '***']]]])
    })
  })

  describe('ignored nodes', () => {
    it('skips ignored nodes when serializing', async () => {
      const { mutation } = await recordMutationOf('<div><script></script></div>', (sandbox: HTMLElement): void => {
        const document = sandbox.ownerDocument
        sandbox.insertBefore(document.createElement('a'), sandbox.firstElementChild)
      })
      // The <script> element is ignored, so sandbox=0 and the new <a> gets id 1
      // (appended as the only known child of sandbox).
      expect(mutation?.data).toEqual([[ChangeType.AddNode, [1, 'A']]])
    })

    describe('does not emit mutations occurring in ignored nodes', () => {
      it('when adding an ignored node', async () => {
        const { mutation } = await recordMutationOf('<div></div>', (sandbox: HTMLElement): void => {
          sandbox.appendChild(sandbox.ownerDocument.createElement('script'))
        })
        expect(mutation).toBeUndefined()
      })

      it('when changing the attributes of an ignored node', async () => {
        const { mutation } = await recordMutationOf('<div><script></script></div>', (sandbox: HTMLElement): void => {
          sandbox.querySelector('script')!.setAttribute('foo', 'bar')
        })
        expect(mutation).toBeUndefined()
      })

      it('when adding a new child node', async () => {
        const { mutation } = await recordMutationOf('<div><script></script></div>', (sandbox: HTMLElement): void => {
          sandbox.querySelector('script')!.appendChild(sandbox.ownerDocument.createTextNode('function foo() {}'))
        })
        expect(mutation).toBeUndefined()
      })

      it('when mutating a known child node', async () => {
        const { mutation } = await recordMutationOf(
          '<div><script></script></div>',
          (sandbox: HTMLElement): void => {
            ;(sandbox.querySelector('script')!.firstChild as Text).data = 'function bar() {}'
          },
          {
            beforeFullSnapshot(sandbox: HTMLElement): void {
              const script = sandbox.querySelector('script')!
              script.appendChild(sandbox.ownerDocument.createTextNode('function foo() {}'))
            },
          }
        )
        expect(mutation).toBeUndefined()
      })

      it('when adding a known child node', async () => {
        const { mutation } = await recordMutationOf(
          '<div>function foo() {}<script></script></div>',
          (sandbox: HTMLElement): void => {
            const textNode = sandbox.firstChild as Text
            sandbox.querySelector('script')!.appendChild(textNode)
          }
        )
        // sandbox=0, textNode=1 (script is not serialized). Moving textNode into the
        // ignored script looks like a removal from sandbox.
        expect(mutation?.data).toEqual([[ChangeType.RemoveNode, 1]])
      })

      it('when moving an ignored node', async () => {
        const { mutation } = await recordMutationOf(
          '<div><a></a><script></script><b></b></div>',
          (sandbox: HTMLElement): void => {
            sandbox.appendChild(sandbox.querySelector('script')!)
          }
        )
        expect(mutation).toBeUndefined()
      })
    })
  })

  describe('hidden nodes', () => {
    it('does not emit attribute mutations on hidden nodes', async () => {
      const { mutation } = await recordMutationOf(
        '<div><div data-dd-privacy="hidden"></div></div>',
        (sandbox: HTMLElement): void => {
          ;(sandbox.firstElementChild as HTMLElement).setAttribute('foo', 'bar')
        }
      )
      expect(mutation).toBeUndefined()
    })

    describe('does not emit mutations occurring in hidden node', () => {
      it('when adding a new node', async () => {
        const { mutation } = await recordMutationOf(
          '<div><div data-dd-privacy="hidden"></div></div>',
          (sandbox: HTMLElement): void => {
            sandbox.firstElementChild!.appendChild(sandbox.ownerDocument.createTextNode('function foo() {}'))
          }
        )
        expect(mutation).toBeUndefined()
      })

      it('when mutating a known child node', async () => {
        const { mutation } = await recordMutationOf(
          '<div><div data-dd-privacy="hidden"></div></div>',
          (sandbox: HTMLElement): void => {
            ;(sandbox.firstElementChild!.firstChild as Text).data = 'function bar() {}'
          },
          {
            beforeFullSnapshot(sandbox: HTMLElement): void {
              const hiddenElement = sandbox.firstElementChild!
              hiddenElement.appendChild(sandbox.ownerDocument.createTextNode('function foo() {}'))
            },
          }
        )
        expect(mutation).toBeUndefined()
      })

      it('when moving a known node into an hidden node', async () => {
        const { mutation } = await recordMutationOf(
          '<div><div data-dd-privacy="hidden"></div>function foo() {}</div>',
          (sandbox: HTMLElement): void => {
            const textNode = sandbox.lastChild as Text
            sandbox.firstElementChild!.appendChild(textNode)
          }
        )
        // sandbox=0, hidden div=1, textNode=2. Moving textNode into the hidden element
        // makes it disappear from the recorded tree.
        expect(mutation?.data).toEqual([[ChangeType.RemoveNode, 2]])
      })
    })
  })

  describe('inputs privacy', () => {
    const testsVariations: Array<{
      privacyAttributeValue: string
      privacyAttributeOn: 'input' | 'ancestor'
      expectedSerializedAttributes: Record<string, string>
      expectedAttributesMutation: Record<string, string> | null
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
        const initialContent =
          privacyAttributeOn === 'ancestor'
            ? `<div ${PRIVACY_ATTR_NAME}="${privacyAttributeValue}"></div>`
            : '<div></div>'

        function setUpInput(sandbox: HTMLElement): HTMLInputElement {
          const input = sandbox.ownerDocument.createElement('input')
          input.value = 'foo'
          if (privacyAttributeOn === 'input') {
            input.setAttribute(PRIVACY_ATTR_NAME, privacyAttributeValue)
          }
          return input
        }

        it('respects the privacy mode for newly added inputs', async () => {
          const { mutation } = await recordMutationOf(initialContent, (sandbox: HTMLElement): void => {
            sandbox.appendChild(setUpInput(sandbox))
          })
          expect(mutation?.data).toEqual([
            [ChangeType.AddNode, [1, 'INPUT', ...Object.entries(expectedSerializedAttributes)]],
          ])
        })

        it('respects the privacy mode for attribute mutations', async () => {
          const { mutation } = await recordMutationOf(
            initialContent,
            (sandbox: HTMLElement): void => {
              sandbox.querySelector('input')!.setAttribute('value', 'bar')
            },
            {
              beforeFullSnapshot(sandbox: HTMLElement): void {
                sandbox.appendChild(setUpInput(sandbox))
              },
            }
          )

          if (expectedAttributesMutation) {
            expect(mutation?.data).toEqual([[ChangeType.Attribute, [1, ...Object.entries(expectedAttributesMutation)]]])
          } else {
            expect(mutation).toBeUndefined()
          }
        })
      })
    }
  })
})
