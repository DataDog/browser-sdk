import type { StringOrStringReference } from '../../../types'
import type { StringId } from '../itemIds'

export interface StringTable {
  add(newString: string): void
  decode(value: StringOrStringReference): string
}

export function createStringTable(): StringTable {
  const strings = new Map<StringId, string>()
  return {
    add(newString: string): void {
      strings.set(strings.size as StringId, newString)
    },
    decode(value: StringOrStringReference): string {
      if (typeof value === 'string') {
        return value // A plain string literal.
      }
      if (typeof value === 'object') {
        return value.string // A role-annotated string literal.
      }

      const referencedString = strings.get(value as StringId)
      if (referencedString === undefined) {
        throw new Error(`Reference to unknown string: ${value}`)
      }
      return referencedString
    },
  }
}
