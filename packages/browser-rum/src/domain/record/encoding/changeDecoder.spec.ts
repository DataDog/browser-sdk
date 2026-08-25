import type { BrowserChangeRecord, Change } from '../../../types'
import { ChangeType, RecordType, StringRole } from '../../../types'
import { createChangeDecoder } from './changeDecoder'
import { createString } from './roles'

describe('ChangeDecoder', () => {
  function changeRecord(...data: Change[]): BrowserChangeRecord {
    return { type: RecordType.Change, timestamp: 0, data }
  }

  it('decodes a string table reference to the string it was defined with', () => {
    const decoder = createChangeDecoder()

    const decoded = decoder.decode(
      changeRecord(
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'Hello World']],
        [ChangeType.Text, [0, 0]]
      )
    )

    // The definition itself is dropped; only the change that refers to it survives.
    expect(decoded.data).toEqual([[ChangeType.Text, [0, 'Hello World']]])
  })

  it('decodes a role-annotated literal to the string it holds', () => {
    const decoder = createChangeDecoder()

    const decoded = decoder.decode(
      changeRecord([ChangeType.Text, [0, createString(StringRole.TextContent, 'Hello World')]])
    )

    expect(decoded.data).toEqual([[ChangeType.Text, [0, 'Hello World']]])
  })

  describe('obsolete string representations', () => {
    const withAddString = () => changeRecord([ChangeType.AddString, 'Hello World'], [ChangeType.Text, [0, 0]])
    const withUntaggedLiteral = () => changeRecord([ChangeType.Text, [0, 'Hello World']])

    it('throws on an AddString change by default', () => {
      expect(() => createChangeDecoder().decode(withAddString())).toThrowError(/Obsolete AddString change/)
    })

    it('throws on an untagged string literal by default', () => {
      expect(() => createChangeDecoder().decode(withUntaggedLiteral())).toThrowError(/Obsolete untagged string literal/)
    })

    it('decodes an AddString change when they are allowed', () => {
      const decoder = createChangeDecoder({ allowObsoleteStringRepresentations: true })

      expect(decoder.decode(withAddString()).data).toEqual([[ChangeType.Text, [0, 'Hello World']]])
    })

    it('decodes an untagged string literal when they are allowed', () => {
      const decoder = createChangeDecoder({ allowObsoleteStringRepresentations: true })

      expect(decoder.decode(withUntaggedLiteral()).data).toEqual([[ChangeType.Text, [0, 'Hello World']]])
    })
  })
  describe('keepRoles', () => {
    it('keeps the role a string was defined in', () => {
      const decoder = createChangeDecoder({ keepRoles: true })

      const decoded = decoder.decode(
        changeRecord(
          [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'Hello World']],
          [ChangeType.Text, [0, 0]]
        )
      )

      expect(decoded.data).toEqual([[ChangeType.Text, [0, createString(StringRole.TextContent, 'Hello World')]]])
    })

    it('keeps the role of a literal that carries its own', () => {
      const decoder = createChangeDecoder({ keepRoles: true })
      const literal = createString(StringRole.Css, 'color: red')

      expect(decoder.decode(changeRecord([ChangeType.Text, [0, literal]])).data).toEqual([
        [ChangeType.Text, [0, literal]],
      ])
    })

    it('gives a string defined by an AddString change the default role', () => {
      const decoder = createChangeDecoder({ allowObsoleteStringRepresentations: true, keepRoles: true })

      expect(
        decoder.decode(changeRecord([ChangeType.AddString, 'Hello World'], [ChangeType.Text, [0, 0]])).data
      ).toEqual([[ChangeType.Text, [0, createString(StringRole.Default, 'Hello World')]]])
    })
  })
})
