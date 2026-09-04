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

  it('decodes an image content resource ID string table reference', () => {
    const decoder = createChangeDecoder()

    const decoded = decoder.decode(
      changeRecord(
        [ChangeType.AddRoleAnnotatedStrings, [StringRole.ResourceId, 'resource-id']],
        [ChangeType.ImageContent, [42, 0]]
      )
    )

    expect(decoded.data).toEqual([[ChangeType.ImageContent, [42, 'resource-id']]])
  })

  describe('clearing the string table', () => {
    it('interprets the references that follow a clear against an emptied string table', () => {
      const decoder = createChangeDecoder()

      const decoded = decoder.decode(
        changeRecord(
          [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'before the clear']],
          [ChangeType.Text, [0, 0]],
          [ChangeType.ClearStrings],
          [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'after the clear']],
          [ChangeType.Text, [1, 0]]
        )
      )

      // The clear is dropped along with the definitions, and the id that both changes use
      // resolves to whichever string the string table held at the time.
      expect(decoded.data).toEqual([
        [ChangeType.Text, [0, 'before the clear']],
        [ChangeType.Text, [1, 'after the clear']],
      ])
    })

    it('keeps the string table cleared for the records that follow', () => {
      const decoder = createChangeDecoder()
      decoder.decode(
        changeRecord(
          [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'before the clear']],
          [ChangeType.ClearStrings]
        )
      )

      const decoded = decoder.decode(
        changeRecord(
          [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'after the clear']],
          [ChangeType.Text, [0, 0]]
        )
      )

      expect(decoded.data).toEqual([[ChangeType.Text, [0, 'after the clear']]])
    })

    it('throws on a reference to a string that a clear discarded', () => {
      const decoder = createChangeDecoder()

      expect(() =>
        decoder.decode(
          changeRecord(
            [ChangeType.AddRoleAnnotatedStrings, [StringRole.TextContent, 'discarded']],
            [ChangeType.ClearStrings],
            [ChangeType.Text, [0, 0]]
          )
        )
      ).toThrowError(/Reference to unknown string/)
    })
  })

  describe('string representations the encoder does not produce', () => {
    const withAddString = () => changeRecord([ChangeType.AddString, 'Hello World'], [ChangeType.Text, [0, 0]])
    const withUntaggedLiteral = () => changeRecord([ChangeType.Text, [0, 'Hello World']])
    const withAnnotatedLiteral = () =>
      changeRecord([ChangeType.Text, [0, createString(StringRole.TextContent, 'Hello World')]])

    it('throws on an AddString change by default', () => {
      expect(() => createChangeDecoder().decode(withAddString())).toThrowError(/Obsolete AddString change/)
    })

    it('throws on an untagged string literal by default', () => {
      expect(() => createChangeDecoder().decode(withUntaggedLiteral())).toThrowError(/Obsolete untagged string literal/)
    })

    it('throws on a role-annotated string literal by default', () => {
      expect(() => createChangeDecoder().decode(withAnnotatedLiteral())).toThrowError(
        /Obsolete string literal outside the string table/
      )
    })

    it('decodes an AddString change when they are allowed', () => {
      const decoder = createChangeDecoder({ allowObsoleteStringRepresentations: true })

      expect(decoder.decode(withAddString()).data).toEqual([[ChangeType.Text, [0, 'Hello World']]])
    })

    it('decodes an untagged string literal when they are allowed', () => {
      const decoder = createChangeDecoder({ allowObsoleteStringRepresentations: true })

      expect(decoder.decode(withUntaggedLiteral()).data).toEqual([[ChangeType.Text, [0, 'Hello World']]])
    })

    it('decodes a role-annotated string literal when they are allowed', () => {
      const decoder = createChangeDecoder({ allowObsoleteStringRepresentations: true })

      expect(decoder.decode(withAnnotatedLiteral()).data).toEqual([[ChangeType.Text, [0, 'Hello World']]])
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
      const decoder = createChangeDecoder({ allowObsoleteStringRepresentations: true, keepRoles: true })
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
