import { StringRole } from '../../../types'
import type { StringId } from './stringIds'
import { createString } from './roles'
import { createStringIds, StringIdConstants } from './stringIds'

describe('StringIds', () => {
  const FIRST_ID = StringIdConstants.FIRST_ID as StringId
  const idAfter = (offset: number) => (FIRST_ID + offset) as StringId

  let stringIds = createStringIds()

  beforeEach(() => {
    stringIds = createStringIds()
  })

  describe('get', () => {
    it('returns undefined for a string that has not been assigned an id', () => {
      expect(stringIds.get(createString(StringRole.TextContent, 'unknown'))).toBeUndefined()
    })

    it('returns the assigned id if one exists', () => {
      const literal = createString(StringRole.TextContent, 'known')
      stringIds.getOrInsert(literal)
      expect(stringIds.get(literal)).toBe(FIRST_ID)
    })

    it('matches on the string and its role, not on the identity of the literal', () => {
      stringIds.getOrInsert(createString(StringRole.TextContent, 'text'))
      expect(stringIds.get(createString(StringRole.TextContent, 'text'))).toBe(FIRST_ID)
    })
  })

  describe('getOrInsert', () => {
    it('assigns ids in order', () => {
      for (let offset = 0; offset < 3; offset++) {
        const literal = createString(StringRole.TextContent, `string${offset}`)
        expect(stringIds.getOrInsert(literal)).toBe(idAfter(offset))
        expect(stringIds.getOrInsert(literal)).toBe(idAfter(offset))
      }
    })

    it('draws from a single sequence of ids shared by every role', () => {
      expect(stringIds.getOrInsert(createString(StringRole.NodeName, 'DIV'))).toBe(idAfter(0))
      expect(stringIds.getOrInsert(createString(StringRole.Css, 'color: red'))).toBe(idAfter(1))
      expect(stringIds.getOrInsert(createString(StringRole.Url, 'https://example.com/'))).toBe(idAfter(2))
    })
  })

  describe('string roles', () => {
    it('gives the same string a distinct id in each role it appears in', () => {
      const asText = createString(StringRole.TextContent, 'shared')
      const asAttributeName = createString(StringRole.AttributeName, 'shared')

      expect(stringIds.getOrInsert(asText)).toBe(idAfter(0))
      expect(stringIds.getOrInsert(asAttributeName)).toBe(idAfter(1))
      expect(stringIds.get(asText)).toBe(idAfter(0))
    })

    it('does not find a string through a role it was not inserted in', () => {
      stringIds.getOrInsert(createString(StringRole.TextContent, 'shared'))
      expect(stringIds.get(createString(StringRole.AttributeName, 'shared'))).toBeUndefined()
    })
  })

  // The strings we store are page content, so they can be anything at all, including the name of
  // a member that every JavaScript object inherits.
  describe('strings that name an inherited property', () => {
    const inheritedNames = ['toString', 'valueOf', 'constructor', 'hasOwnProperty', '__proto__']

    it('reports them as absent until they are inserted', () => {
      for (const name of inheritedNames) {
        expect(stringIds.get(createString(StringRole.TextContent, name))).toBeUndefined()
      }
    })

    it('assigns them ids like any other string', () => {
      inheritedNames.forEach((name, offset) => {
        const literal = createString(StringRole.TextContent, name)
        expect(stringIds.getOrInsert(literal)).toBe(idAfter(offset))
        expect(stringIds.get(literal)).toBe(idAfter(offset))
      })
    })
  })

  describe('clear', () => {
    it('removes the mappings of every role', () => {
      const asText = createString(StringRole.TextContent, 'shared')
      const asCss = createString(StringRole.Css, 'shared')
      stringIds.getOrInsert(asText)
      stringIds.getOrInsert(asCss)

      stringIds.clear()

      expect(stringIds.get(asText)).toBeUndefined()
      expect(stringIds.get(asCss)).toBeUndefined()
    })

    it('restarts the id sequence', () => {
      stringIds.getOrInsert(createString(StringRole.TextContent, 'first'))
      stringIds.getOrInsert(createString(StringRole.TextContent, 'second'))

      stringIds.clear()

      expect(stringIds.getOrInsert(createString(StringRole.TextContent, 'third'))).toBe(FIRST_ID)
    })
  })

  describe('size', () => {
    it('increments when an id is assigned', () => {
      expect(stringIds.size).toBe(0)
      stringIds.getOrInsert(createString(StringRole.TextContent, 'first'))
      expect(stringIds.size).toBe(1)
      stringIds.getOrInsert(createString(StringRole.AttributeName, 'second'))
      expect(stringIds.size).toBe(2)
    })
  })
})
