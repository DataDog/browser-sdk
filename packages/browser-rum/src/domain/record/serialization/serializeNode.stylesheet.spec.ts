import { isAdoptedStyleSheetsSupported } from '@datadog/browser-core/test'
import { ChangeType } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import { serializeHtml } from '../test/serializeHtml.specHelper'
import type { SerializationStats } from './serializationStats'

describe('serializeNode for stylesheets', () => {
  let originalTimeout: number

  beforeAll(() => {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000
  })

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
  })

  const css = 'div { color: green; }'
  const dynamicCss = 'span { color: red; }'

  describe('for <style> elements', () => {
    it('serializes the element', async () => {
      const record = await serializeHtml('<style id="foo"></style>', {
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 0, max: 0, sum: 0 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'STYLE', ['id', 'foo']]]])
    })

    it('serializes multiple elements and aggregates their statistics', async () => {
      const record = await serializeHtml(
        `
        <div>
          <style id="foo">${css}</style>
          <style id="bar">${css}</style>
        </div>
        `,
        {
          after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
            expect(stats).toEqual({
              cssText: { count: 2, max: 21, sum: 42 },
              serializationDuration: jasmine.anything(),
            })
          },
        }
      )
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'DIV'], [1, 'STYLE', ['id', 'foo']], [0, 'STYLE', ['id', 'bar']]],
        [ChangeType.AddStyleSheet, ['div { color: green; }'], ['div { color: green; }']],
        [ChangeType.AttachedStyleSheets, [1, 0], [2, 1]],
      ])
    })

    it('serializes the contents of the associated stylesheet', async () => {
      const record = await serializeHtml(`<style>${css}</style>`, {
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 21, sum: 21 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'STYLE']],
        [ChangeType.AddStyleSheet, [css]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })

    it('serializes dynamically inserted CSS rules', async () => {
      const record = await serializeHtml('<style></style>', {
        before(target: Node): void {
          ;(target as HTMLStyleElement).sheet!.insertRule(dynamicCss)
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 20, sum: 20 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'STYLE']],
        [ChangeType.AddStyleSheet, [dynamicCss]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })

    it('serializes a mix of static and dynamic CSS rules', async () => {
      const record = await serializeHtml(`<style>${css}</style>`, {
        before(target: Node): void {
          ;(target as HTMLStyleElement).sheet!.insertRule(dynamicCss)
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 41, sum: 41 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'STYLE']],
        [ChangeType.AddStyleSheet, [`${dynamicCss}${css}`]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })

    it('serializes dynamically modified CSS rules', async () => {
      const record = await serializeHtml(`<style>${css}</style>`, {
        before(target: Node): void {
          const sheet = (target as HTMLStyleElement).sheet!
          const rule = sheet.cssRules[0] as CSSStyleRule
          rule.selectorText = 'span'
          rule.style.color = 'red'
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 20, sum: 20 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'STYLE']],
        [ChangeType.AddStyleSheet, [dynamicCss]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })
  })

  describe('for <style> element children', () => {
    it('does not serialize them', async () => {
      const record = await serializeHtml(`<style>${css}</style>`, { target: (node: Node) => node.firstChild! })
      expect(record).toBeUndefined()
    })
  })

  describe('for <link rel="stylesheet"> elements', () => {
    const sheet = {
      href: 'https://datadoghq.invalid/some/style.css',
      cssRules: [{ cssText: css }],
    }

    it('serializes the element when the sheet is accessible', async () => {
      const record = await serializeHtml(`<link rel="stylesheet" href="${sheet.href}">`, {
        before(target: Node): void {
          // Simulate a successful fetch of the stylesheet. (In reality, the fetch will
          // fail, so `target.sheet` won't be populated by the browser.)
          Object.defineProperty(target.ownerDocument, 'styleSheets', {
            value: [sheet],
            configurable: true,
          })
          Object.defineProperty(target, 'sheet', {
            value: sheet,
            configurable: true,
          })
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 21, sum: 21 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'LINK', ['rel', 'stylesheet'], ['href', sheet.href]]],
        [ChangeType.AddStyleSheet, [css]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })

    it('serializes the element when the sheet is unavailable', async () => {
      const record = await serializeHtml(`<link rel="stylesheet" href="${sheet.href}">`, {
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 0, max: 0, sum: 0 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'LINK', ['rel', 'stylesheet'], ['href', sheet.href]]]])
    })

    it('serializes the element when the sheet is unreadable due to CORS', async () => {
      const unreadableSheet = { ...sheet }
      Object.defineProperty(unreadableSheet, 'cssRules', {
        get() {
          throw new Error('SecurityError')
        },
      })

      const record = await serializeHtml(`<link rel="stylesheet" href="${sheet.href}">`, {
        before(target: Node): void {
          // Simulate a successful fetch of the stylesheet which is unreadable due to CORS.
          Object.defineProperty(target.ownerDocument, 'styleSheets', {
            value: [unreadableSheet],
            configurable: true,
          })
          Object.defineProperty(target, 'sheet', {
            value: unreadableSheet,
            configurable: true,
          })
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 0, max: 0, sum: 0 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'LINK', ['rel', 'stylesheet'], ['href', unreadableSheet.href]]],
      ])
    })

    it('serializes a stylesheet shared by several elements only once', async () => {
      const record = await serializeHtml(
        `
        <div>
          <link rel="stylesheet" href="${sheet.href}">
          <link rel="stylesheet" href="${sheet.href}">
        </div>
        `,
        {
          before(target: Node): void {
            // Simulate two elements sharing the same stylesheet. (Browsers don't actually
            // do this, but we shouldn't depend on that to keep our stylesheet ids correct.)
            for (const link of (target as Element).querySelectorAll('link')) {
              Object.defineProperty(link, 'sheet', {
                value: sheet,
                configurable: true,
              })
            }
          },
        }
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'DIV'],
          [1, 'LINK', ['rel', 'stylesheet'], ['href', sheet.href]],
          [0, 'LINK', ['rel', 'stylesheet'], ['href', sheet.href]],
        ],
        [ChangeType.AddStyleSheet, [css]],
        [ChangeType.AttachedStyleSheets, [1, 0], [2, 0]],
      ])
    })
  })

  describe('for documents with adopted stylesheets', () => {
    it('serializes the stylesheet', async () => {
      if (!isAdoptedStyleSheetsSupported()) {
        pending('No adoptedStyleSheets support.')
      }

      const record = await serializeHtml(
        `
        <!doctype HTML>
        <div></div>
        `,
        {
          input: 'document',
          before(target: Node): void {
            const document = target as Document
            const window = document.defaultView!
            const sheet = new window.CSSStyleSheet()
            sheet.insertRule(css)
            document.adoptedStyleSheets = [sheet]
          },
          after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
            expect(stats).toEqual({
              cssText: { count: 1, max: 21, sum: 21 },
              serializationDuration: jasmine.anything(),
            })
          },
        }
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, '#document'],
          [1, '#doctype', 'html', '', ''],
          [0, 'HTML'],
          [1, 'HEAD'],
          [0, 'BODY'],
          [1, 'DIV'],
        ],
        [ChangeType.ScrollPosition, [0, 0, 0]],
        [ChangeType.AddStyleSheet, [[css]]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })

    it('serializes a stylesheet shared with a shadow root only once', async () => {
      if (!isAdoptedStyleSheetsSupported()) {
        pending('No adoptedStyleSheets support.')
      }

      const record = await serializeHtml(
        `
        <!doctype HTML>
        <div></div>
        `,
        {
          input: 'document',
          before(target: Node): void {
            const document = target as Document
            const window = document.defaultView!
            const sheet = new window.CSSStyleSheet()
            sheet.insertRule(css)
            document.adoptedStyleSheets = [sheet]
            document.querySelector('div')!.attachShadow({ mode: 'open' }).adoptedStyleSheets = [sheet]
          },
          after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
            expect(stats).toEqual({
              cssText: { count: 1, max: 21, sum: 21 },
              serializationDuration: jasmine.anything(),
            })
          },
        }
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, '#document'],
          [1, '#doctype', 'html', '', ''],
          [0, 'HTML'],
          [1, 'HEAD'],
          [0, 'BODY'],
          [1, 'DIV'],
          [1, '#shadow-root'],
        ],
        [ChangeType.ScrollPosition, [0, 0, 0]],
        [ChangeType.AddStyleSheet, [[css]]],
        [ChangeType.AttachedStyleSheets, [0, 0], [6, 0]],
      ])
    })
  })

  describe('for shadow roots with adopted stylesheets', () => {
    function adoptStyleSheets(host: Element, sheets: CSSStyleSheet[]): void {
      host.attachShadow({ mode: 'open' }).adoptedStyleSheets = sheets
    }

    function createStyleSheet(document: Document, rule: string): CSSStyleSheet {
      const sheet = new document.defaultView!.CSSStyleSheet()
      sheet.insertRule(rule)
      return sheet
    }

    beforeEach(() => {
      if (!isAdoptedStyleSheetsSupported()) {
        pending('No adoptedStyleSheets support.')
      }
    })

    it('serializes the stylesheet', async () => {
      const record = await serializeHtml('<x-a></x-a>', {
        before(target: Node): void {
          adoptStyleSheets(target as Element, [createStyleSheet(target.ownerDocument!, css)])
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 21, sum: 21 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'X-A'], [1, '#shadow-root']],
        [ChangeType.AddStyleSheet, [[css]]],
        [ChangeType.AttachedStyleSheets, [1, 0]],
      ])
    })

    it('serializes a stylesheet shared by several shadow roots only once', async () => {
      const record = await serializeHtml('<div><x-a></x-a><x-a></x-a><x-a></x-a><x-b></x-b></div>', {
        before(target: Node): void {
          const document = target.ownerDocument!
          const sheetA = createStyleSheet(document, css)
          const sheetB = createStyleSheet(document, dynamicCss)
          for (const host of (target as Element).querySelectorAll('x-a')) {
            adoptStyleSheets(host, [sheetA])
          }
          adoptStyleSheets((target as Element).querySelector('x-b')!, [sheetB])
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 2, max: 21, sum: 41 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'DIV'],
          [1, 'X-A'],
          [1, '#shadow-root'],
          [3, 'X-A'],
          [1, '#shadow-root'],
          [5, 'X-A'],
          [1, '#shadow-root'],
          [7, 'X-B'],
          [1, '#shadow-root'],
        ],
        [ChangeType.AddStyleSheet, [[css]], [[dynamicCss]]],
        [ChangeType.AttachedStyleSheets, [2, 0], [4, 0], [6, 0], [8, 1]],
      ])
    })

    it('serializes only the adopted stylesheets that have not already been serialized', async () => {
      const record = await serializeHtml('<div><x-a></x-a><x-b></x-b></div>', {
        before(target: Node): void {
          const document = target.ownerDocument!
          const sheetA = createStyleSheet(document, css)
          const sheetB = createStyleSheet(document, dynamicCss)
          adoptStyleSheets((target as Element).querySelector('x-a')!, [sheetA])
          adoptStyleSheets((target as Element).querySelector('x-b')!, [sheetB, sheetA])
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'DIV'], [1, 'X-A'], [1, '#shadow-root'], [3, 'X-B'], [1, '#shadow-root']],
        [ChangeType.AddStyleSheet, [[css]], [[dynamicCss]]],
        [ChangeType.AttachedStyleSheets, [2, 0], [4, 1, 0]],
      ])
    })
  })
})
