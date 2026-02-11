import type { StyleSheetId } from '../../itemIds'
import type { VDocument } from './vDocument'
import { createVDocument } from './vDocument'

describe('VStyleSheet', () => {
  let document: VDocument

  beforeEach(() => {
    document = createVDocument()
  })

  it('has the expected state on creation', () => {
    const sheet = document.createStyleSheet({
      disabled: false,
      mediaList: [],
      rules: 'div { color: red }',
    })

    expect(sheet.id).toBe(0 as StyleSheetId)
    expect(sheet.ownerDocument).toBe(document)
    expect(sheet.data).toEqual({
      disabled: false,
      mediaList: [],
      rules: 'div { color: red }',
    })
  })

  describe('renderAsAdoptedStyleSheet', () => {
    it('converts string rules to array', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: 'div { color: red }',
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result).toEqual({
        cssRules: ['div { color: red }'],
        disabled: undefined,
        media: undefined,
      })
    })

    it('preserves array rules', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: ['div { color: red }', 'span { color: blue }'],
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result).toEqual({
        cssRules: ['div { color: red }', 'span { color: blue }'],
        disabled: undefined,
        media: undefined,
      })
    })

    it('renders disabled as true when data.disabled is true', () => {
      const sheet = document.createStyleSheet({
        disabled: true,
        mediaList: [],
        rules: 'div { color: red }',
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result.disabled).toBe(true)
    })

    it('renders disabled as undefined when data.disabled is false', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: 'div { color: red }',
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result.disabled).toBe(undefined)
    })

    it('renders media when mediaList has elements', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: ['screen', 'print'],
        rules: 'div { color: red }',
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result.media).toEqual(['screen', 'print'])
    })

    it('renders media as undefined when mediaList is empty', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: 'div { color: red }',
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result.media).toBe(undefined)
    })

    it('renders media when mediaList has a single element', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: ['screen'],
        rules: 'div { color: red }',
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result.media).toEqual(['screen'])
    })

    it('handles empty string rules', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: '',
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result).toEqual({
        cssRules: [''],
        disabled: undefined,
        media: undefined,
      })
    })

    it('handles empty array rules', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: [],
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result).toEqual({
        cssRules: [],
        disabled: undefined,
        media: undefined,
      })
    })

    it('renders all properties when all are set', () => {
      const sheet = document.createStyleSheet({
        disabled: true,
        mediaList: ['screen', 'print'],
        rules: ['div { color: red }', 'span { color: blue }', 'p { font-size: 14px }'],
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result).toEqual({
        cssRules: ['div { color: red }', 'span { color: blue }', 'p { font-size: 14px }'],
        disabled: true,
        media: ['screen', 'print'],
      })
    })

    it('handles complex CSS rules as string', () => {
      const complexCSS = `
        @media screen and (min-width: 768px) {
          .container {
            max-width: 1200px;
          }
        }
        @keyframes fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: complexCSS,
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result).toEqual({
        cssRules: [complexCSS],
        disabled: undefined,
        media: undefined,
      })
    })

    it('handles complex CSS rules as array', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: [
          '@media screen { div { color: red } }',
          '@keyframes fade { from { opacity: 0 } }',
          '.class { background: blue }',
        ],
      })

      const result = sheet.renderAsAdoptedStyleSheet()

      expect(result).toEqual({
        cssRules: [
          '@media screen { div { color: red } }',
          '@keyframes fade { from { opacity: 0 } }',
          '.class { background: blue }',
        ],
        disabled: undefined,
        media: undefined,
      })
    })
  })

  describe('renderAsCssText', () => {
    it('returns string rules directly', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: 'div { color: red }',
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe('div { color: red }')
    })

    it('joins array rules with empty string', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: ['div { color: red }', 'span { color: blue }'],
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe('div { color: red }span { color: blue }')
    })

    it('handles empty string rules', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: '',
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe('')
    })

    it('handles empty array rules', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: [],
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe('')
    })

    it('handles array with single rule', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: ['div { color: red }'],
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe('div { color: red }')
    })

    it('handles array with multiple rules', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: ['rule1', 'rule2', 'rule3'],
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe('rule1rule2rule3')
    })

    it('preserves whitespace and formatting in string rules', () => {
      const formattedCSS = `
div {
  color: red;
  background: blue;
}

span {
  font-size: 14px;
}
      `.trim()

      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: formattedCSS,
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe(formattedCSS)
    })

    it('concatenates array rules without separator', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: ['div { color: red; }', 'span { color: blue; }', 'p { font-size: 14px; }'],
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe('div { color: red; }span { color: blue; }p { font-size: 14px; }')
    })

    it('handles complex CSS as string', () => {
      const complexCSS = `
        @media screen and (min-width: 768px) {
          .container {
            max-width: 1200px;
          }
        }
        @keyframes fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: complexCSS,
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe(complexCSS)
    })

    it('does not include disabled or mediaList properties', () => {
      const sheet = document.createStyleSheet({
        disabled: true,
        mediaList: ['screen', 'print'],
        rules: 'div { color: red }',
      })

      const result = sheet.renderAsCssText()

      expect(result).toBe('div { color: red }')
      expect(typeof result).toBe('string')
    })
  })

  describe('data getter', () => {
    it('returns the stylesheet data', () => {
      const data = {
        disabled: true,
        mediaList: ['screen'],
        rules: ['rule1', 'rule2'],
      }
      const sheet = document.createStyleSheet(data)

      expect(sheet.data).toBe(data)
    })

    it('allows access to individual data properties', () => {
      const sheet = document.createStyleSheet({
        disabled: true,
        mediaList: ['screen', 'print'],
        rules: 'div { color: red }',
      })

      expect(sheet.data.disabled).toBe(true)
      expect(sheet.data.mediaList).toEqual(['screen', 'print'])
      expect(sheet.data.rules).toBe('div { color: red }')
    })
  })

  describe('id getter', () => {
    it('returns the stylesheet id', () => {
      const sheet1 = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: '',
      })
      const sheet2 = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: '',
      })

      expect(sheet1.id).toBe(0 as StyleSheetId)
      expect(sheet2.id).toBe(1 as StyleSheetId)
    })
  })

  describe('ownerDocument getter', () => {
    it('returns the owner document', () => {
      const sheet = document.createStyleSheet({
        disabled: false,
        mediaList: [],
        rules: '',
      })

      expect(sheet.ownerDocument).toBe(document)
    })
  })
})
