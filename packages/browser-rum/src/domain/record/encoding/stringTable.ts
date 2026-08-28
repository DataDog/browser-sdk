import type { RoleAnnotatedStringLiteral, StringLiteral, StringOrStringReference } from '../../../types'
import { StringRole } from '../../../types'
import { createString } from './roles'
import type { StringId } from './stringIds'

export interface StringTable {
  add(newString: string, role: StringRole): void

  /** Remove every string from the table, so that the next string added gets the first id. */
  clear(): void

  /** The string that the given value holds, whichever form it takes. */
  decode(value: StringOrStringReference): string

  /**
   * The given value in the form the decoded record should carry it: the string on its own, or the
   * string together with the role it was defined in, depending on how the table was created.
   */
  decodeAnnotated(value: StringOrStringReference): StringLiteral | RoleAnnotatedStringLiteral
}

export function createStringTable(allowObsoleteStringRepresentations = false, keepRoles = false): StringTable {
  const strings = new Map<StringId, RoleAnnotatedStringLiteral>()

  // The string the given value holds, along with the role it holds it in.
  const literalOf = (value: StringOrStringReference): RoleAnnotatedStringLiteral => {
    if (typeof value === 'string') {
      // A plain string literal. The encoder tags every literal it emits with a role, so one
      // without a role means something built this change data outside the encoder.
      if (!allowObsoleteStringRepresentations) {
        throw new Error(`Obsolete untagged string literal: ${value}`)
      }
      // An untagged literal says nothing about what it holds, which is the default role.
      return createString(StringRole.Default, value)
    }

    if (typeof value === 'object') {
      // A role-annotated string literal. The encoder gives every string an entry in the
      // string table, so something must have built this change data outside the encoder.
      if (!allowObsoleteStringRepresentations) {
        throw new Error(`Obsolete string literal outside the string table: ${value.string}`)
      }
      return value
    }

    const referencedString = strings.get(value as StringId)
    if (referencedString === undefined) {
      throw new Error(`Reference to unknown string: ${value}`)
    }
    return referencedString
  }

  return {
    add(newString: string, role: StringRole): void {
      strings.set(strings.size as StringId, createString(role, newString))
    },
    clear(): void {
      strings.clear()
    },
    decode(value: StringOrStringReference): string {
      return literalOf(value).string
    },
    decodeAnnotated(value: StringOrStringReference): StringLiteral | RoleAnnotatedStringLiteral {
      const literal = literalOf(value)
      return keepRoles ? literal : literal.string
    },
  }
}
