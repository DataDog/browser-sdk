import type { StringId } from '../../itemIds'

export interface StringTable {
  add(newString: string): void
  decode(stringOrStringId: number | string): string
}

export function createStringTable(): StringTable {
  const strings = new Map<StringId, string>()
  return {
    add(newString: string): void {
      strings.set(strings.size as StringId, newString)
    },
    decode(stringOrStringId: number | string): string {
      if (typeof stringOrStringId === 'string') {
        return stringOrStringId
      }
      const referencedString = strings.get(stringOrStringId as StringId)
      if (referencedString === undefined) {
        throw new Error(`Reference to unknown string: ${stringOrStringId}`)
      }
      return referencedString
    },
  }
}
