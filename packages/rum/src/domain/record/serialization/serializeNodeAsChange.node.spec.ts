import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN, PRIVACY_ATTR_VALUE_MASK } from '@datadog/browser-rum-core'
import { DefaultPrivacyLevel } from '@datadog/browser-core'
import type { BrowserChangeRecord } from '../../../types'
import { ChangeType, PlaybackState } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import type { ScrollPositions } from '../elementsScrollPositions'
import { SerializationKind } from './serializationTransaction'

import { serializeHtmlAsChange } from './serializeHtml.specHelper'

describe('serializeNodeAsChange for DOM nodes', () => {
  describe('for #cdata-section nodes', () => {
    it('serializes the node', async () => {
      const record = await serializeHtmlAsChange('<div></div>', {
        target: (node: Node) => {
          // It's surprisingly tricky to create a CDATA section, since HTML documents are
          // not allowed to contain them in normal circumstances; the HTML parser will
          // convert them into comments, and calling createCDATASection() throws unless
          // it's invoked on an XML document. That's why this test uses this hacky
          // approach.
          const doc = new DOMParser().parseFromString('<xml></xml>', 'application/xml')
          const cdata = doc.createCDATASection('cdata')
          node.appendChild(node.ownerDocument!.importNode(cdata))
          return node.firstChild!
        },
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, '#cdata-section']]])
    })
  })

  describe('for #comment nodes', () => {
    it('does not serialize the node', async () => {
      const record = await serializeHtmlAsChange('<!-- comment -->')
      expect(record?.data).toBeUndefined()
    })
  })

  describe('for #document nodes', () => {
    it('serializes the #document node', async () => {
      const record = await serializeHtmlAsChange('<!doctype html><html>foo</html>', { input: 'document' })
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, '#document'],
          [1, '#doctype', 'html', '', ''],
          [0, 'HTML'],
          [1, 'HEAD'],
          [0, 'BODY'],
          [1, '#text', 'foo'],
        ],
        [ChangeType.ScrollPosition, [0, 0, 0]],
      ])
    })

    it('serializes the #document node when the default privacy level is MASK', async () => {
      const record = await serializeHtmlAsChange('<!doctype html><html>foo</html>', {
        configuration: { defaultPrivacyLevel: DefaultPrivacyLevel.MASK },
        input: 'document',
      })
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, '#document'],
          [1, '#doctype', 'html', '', ''],
          [0, 'HTML'],
          [1, 'HEAD'],
          [0, 'BODY'],
          [1, '#text', 'xxx'],
        ],
        [ChangeType.ScrollPosition, [0, 0, 0]],
      ])
    })
  })

  describe('for #text nodes', () => {
    it('serializes the node', async () => {
      const record = await serializeHtmlAsChange('<div>text content</div>', {
        target: (node: Node) => node.firstChild!,
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, '#text', 'text content']]])
    })

    it('serializes a node with no text content', async () => {
      const record = await serializeHtmlAsChange('<div>xxx</div>', {
        before(target: Node): void {
          target.textContent = ''
        },
        target(defaultTarget: Node): Node {
          return defaultTarget.firstChild!
        },
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, '#text', '']]])
    })

    it('does not serialize a whitespace-only node if the parent is a <head> element', async () => {
      const record = await serializeHtmlAsChange('<!doctype HTML><head>    </head>', {
        input: 'document',
        target: (node: Node) => (node as Document).head.firstChild!,
        whitespace: 'keep',
      })
      expect(record?.data).toBeUndefined()
    })
  })

  describe('for HTML elements', () => {
    it('serializes the element', async () => {
      const record = await serializeHtmlAsChange('<div>')
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'DIV']]])
    })

    it("serializes the HTML element's attributes", async () => {
      const record = await serializeHtmlAsChange(
        '<div foo="bar" data-foo="data-bar" class="zog" style="width: 10px;"></div>'
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'DIV', ['foo', 'bar'], ['data-foo', 'data-bar'], ['class', 'zog'], ['style', 'width: 10px;']],
        ],
      ])
    })
  })

  describe('for SVG elements', () => {
    it('serializes the element', async () => {
      const record = await serializeHtmlAsChange(`
        <svg viewBox="0 0 100 100">
          <clipPath id="myClip">
            <circle cx="40" cy="35" r="35" />
          </clipPath>
          <path
            id="heart"
            d="M10,30 A20,20,0,0,1,50,30 A20,20,0,0,1,90,30 Q90,60,50,90 Q10,60,10,30 Z" />
          <use clip-path="url(#myClip)" href="#heart" fill="red" />
        </svg>
      `)
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'svg>svg', ['viewBox', '0 0 100 100']],
          [1, 'svg>clipPath', ['id', 'myClip']],
          [1, 'svg>circle', ['cx', '40'], ['cy', '35'], ['r', '35']],
          [
            3,
            'svg>path',
            ['id', 'heart'],
            ['d', 'M10,30 A20,20,0,0,1,50,30 A20,20,0,0,1,90,30 Q90,60,50,90 Q10,60,10,30 Z'],
          ],
          [0, 'svg>use', ['clip-path', 'url(#myClip)'], ['href', '#heart'], ['fill', 'red']],
        ],
      ])
    })
  })

  describe('for <audio> elements', () => {
    it("serializes the <audio> element's playback state when paused", async () => {
      const record = await serializeHtmlAsChange('<audio></audio>')
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'AUDIO']],
        [ChangeType.MediaPlaybackState, [0, PlaybackState.Paused]],
      ])
    })

    it("serializes the <audio> element's playback state when playing", async () => {
      const record = await serializeHtmlAsChange('<audio></audio>', {
        before(target: Node): void {
          // Emulate a playing audio file.
          Object.defineProperty(target, 'paused', { value: false })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'AUDIO']],
        [ChangeType.MediaPlaybackState, [0, PlaybackState.Playing]],
      ])
    })
  })

  describe('for <head> elements', () => {
    it('does not serialize whitespace', async () => {
      const record = await serializeHtmlAsChange('<!doctype HTML><head>  <title>  foo </title>  </head>', {
        input: 'document',
        whitespace: 'keep',
      })
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, '#document'],
          [1, '#doctype', 'html', '', ''],
          [0, 'HTML'],
          [1, 'HEAD'],
          [1, 'TITLE'],
          [1, '#text', '  foo '],
          [4, 'BODY'],
        ],
        [ChangeType.ScrollPosition, [0, 0, 0]],
      ])
    })
  })

  describe('for <link> elements', () => {
    it('serializes the element', async () => {
      const record = await serializeHtmlAsChange(`
        <link rel="alternate" type="application/atom+xml" href="posts.xml" title="Blog">
      `)
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [
            null,
            'LINK',
            ['rel', 'alternate'],
            ['type', 'application/atom+xml'],
            ['href', 'posts.xml'],
            ['title', 'Blog'],
          ],
        ],
      ])
    })

    it('does not serialize <link rel="shortcut icon">', async () => {
      const record = await serializeHtmlAsChange('<link rel="shortcut icon">')
      expect(record?.data).toBeUndefined()
    })
  })

  describe('for <meta> elements', () => {
    it('serializes the element', async () => {
      const record = await serializeHtmlAsChange(`
        <meta name="viewport" content="width=device-width, initial-scale=1">
      `)
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'META', ['name', 'viewport'], ['content', 'width=device-width, initial-scale=1']]],
      ])
    })

    it('does not serialize <meta name="keywords">', async () => {
      const record = await serializeHtmlAsChange(`
        <meta name="keywords" content="products" lang="en">
      `)
      expect(record?.data).toBeUndefined()
    })

    it('does not serialize <meta name="KeYwOrDs">', async () => {
      const record = await serializeHtmlAsChange(`
        <meta name="KeYwOrDs" content="products" lang="en">
      `)
      expect(record?.data).toBeUndefined()
    })
  })

  describe('for <script> elements', () => {
    it('does not serialize the element', async () => {
      const record = await serializeHtmlAsChange('<script></script>')
      expect(record?.data).toBeUndefined()
    })
  })

  describe('for children of <script> elements', () => {
    it('does not serialize them', async () => {
      const record = await serializeHtmlAsChange('<script>foo</script>', {
        target: (node: Node) => node.firstChild!,
      })
      expect(record?.data).toBeUndefined()
    })
  })

  describe('for <video> elements', () => {
    it("serializes the <video> element's playback state when paused", async () => {
      const record = await serializeHtmlAsChange('<video></video>')
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'VIDEO']],
        [ChangeType.MediaPlaybackState, [0, PlaybackState.Paused]],
      ])
    })

    it("serializes the <video> element's playback state when playing", async () => {
      const record = await serializeHtmlAsChange('<video></video>', {
        before(target: Node): void {
          // Emulate a playing video.
          Object.defineProperty(target, 'paused', { value: false })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'VIDEO']],
        [ChangeType.MediaPlaybackState, [0, PlaybackState.Playing]],
      ])
    })
  })

  describe('for elements with NodePrivacyLevel.HIDDEN', () => {
    it('generates a placeholder', async () => {
      const record = await serializeHtmlAsChange(`
        <div
          ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_HIDDEN}"
          style="width: 200px; height: 100px;"
          data-attribute="foo"
        >
          <span>Foo</span>
        </div>
      `)
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'DIV', ['data-dd-privacy', 'hidden']]],
        [ChangeType.Size, [0, jasmine.any(Number), jasmine.any(Number)]],
      ])
    })
  })

  describe('for children of elements with NodePrivacyLevel.HIDDEN', () => {
    it('does not serialize them', async () => {
      const record = await serializeHtmlAsChange(
        `
        <div ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_HIDDEN}">
          <span>Foo</span>
        </div>
        `,
        {
          target: (node: Node) => node.firstChild!,
        }
      )
      expect(record?.data).toBeUndefined()
    })
  })

  describe('for scrollable elements', () => {
    const scrollableElement = `
      <div style="width: 100px; height: 100px; overflow: scroll">
        <div style="width: 200px; height: 200px"></div>
      </div>
    `

    function serializeScrollableElement(
      scrollPositions: ScrollPositions | undefined
    ): Promise<BrowserChangeRecord | undefined> {
      return serializeHtmlAsChange(scrollableElement, {
        before(target: Node): void {
          if (scrollPositions) {
            ;(target as Element).scrollBy(scrollPositions.scrollLeft, scrollPositions.scrollTop)
          }
        },
        after(target: Node, scope: RecordingScope): void {
          expect(scope.elementsScrollPositions.get(target as Element)).toEqual(scrollPositions)
        },
      })
    }

    describe('during the initial full snapshot', () => {
      it('reads the scroll position from the DOM and serializes it', async () => {
        const record = await serializeScrollableElement({ scrollLeft: 10, scrollTop: 20 })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, 'DIV', ['style', 'width: 100px; height: 100px; overflow: scroll']],
            [1, 'DIV', ['style', 'width: 200px; height: 200px']],
          ],
          [ChangeType.ScrollPosition, [0, 10, 20]],
        ])
      })

      it('does not serialize the scroll position if the element has not been scrolled', async () => {
        const record = await serializeScrollableElement(undefined)
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, 'DIV', ['style', 'width: 100px; height: 100px; overflow: scroll']],
            [1, 'DIV', ['style', 'width: 200px; height: 200px']],
          ],
        ])
      })
    })

    describe('during subsequent full snapshots', () => {
      it('reads the scroll position from ElementScrollPositions and serializes it', async () => {
        const record = await serializeHtmlAsChange(scrollableElement, {
          before(target: Node, scope: RecordingScope): void {
            scope.elementsScrollPositions.set(target as Element, { scrollLeft: 10, scrollTop: 20 })
          },
          kind: SerializationKind.SUBSEQUENT_FULL_SNAPSHOT,
        })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, 'DIV', ['style', 'width: 100px; height: 100px; overflow: scroll']],
            [1, 'DIV', ['style', 'width: 200px; height: 200px']],
          ],
          [ChangeType.ScrollPosition, [0, 10, 20]],
        ])
      })

      it('does not read the scroll position from the DOM', async () => {
        const record = await serializeHtmlAsChange(scrollableElement, {
          before(target: Node): void {
            ;(target as Element).scrollBy(10, 20)
          },
          after(target: Node, scope: RecordingScope): void {
            expect(scope.elementsScrollPositions.get(target as Element)).toBeUndefined()
          },
          kind: SerializationKind.SUBSEQUENT_FULL_SNAPSHOT,
        })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, 'DIV', ['style', 'width: 100px; height: 100px; overflow: scroll']],
            [1, 'DIV', ['style', 'width: 200px; height: 200px']],
          ],
        ])
      })
    })

    describe('during incremental mutations', () => {
      it('does not serialize the scroll position', async () => {
        const record = await serializeHtmlAsChange(scrollableElement, {
          before(target: Node, scope: RecordingScope): void {
            ;(target as Element).scrollBy(10, 20)
            scope.elementsScrollPositions.set(target as Element, { scrollLeft: 10, scrollTop: 20 })
          },
          kind: SerializationKind.INCREMENTAL_SNAPSHOT,
        })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, 'DIV', ['style', 'width: 100px; height: 100px; overflow: scroll']],
            [1, 'DIV', ['style', 'width: 200px; height: 200px']],
          ],
        ])
      })
    })
  })

  describe('for shadow hosts', () => {
    it('serializes the element and its shadow root', async () => {
      const record = await serializeHtmlAsChange('<div id="shadow-host"></div>', {
        before(target: Node): void {
          ;(target as Element).attachShadow({ mode: 'open' })
        },
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'DIV', ['id', 'shadow-host']], [1, '#shadow-root']]])
    })

    it('serializes elements within the shadow subtree', async () => {
      const record = await serializeHtmlAsChange('<div id="shadow-host"></div>', {
        before(target: Node): void {
          const shadowRoot = (target as Element).attachShadow({ mode: 'open' })
          shadowRoot.appendChild(target.ownerDocument!.createElement('hr'))
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'DIV', ['id', 'shadow-host']], [1, '#shadow-root'], [1, 'HR']],
      ])
    })

    it("propagates the element's privacy level to its shadow subtree", async () => {
      const record = await serializeHtmlAsChange(
        `
        <div
          id="shadow-host"
          ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK}"
        ></input>
        `,
        {
          before(target: Node): void {
            const shadowRoot = (target as Element).attachShadow({ mode: 'open' })
            shadowRoot.appendChild(target.ownerDocument!.createTextNode('foo'))
          },
        }
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'DIV', ['id', 'shadow-host'], [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK]],
          [1, '#shadow-root'],
          [1, '#text', 'xxx'],
        ],
      ])
    })
  })
})
