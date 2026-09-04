import type { RoleAnnotatedStringLiteral } from '../../../types'
import { StringRole } from '../../../types'

export type StringId = number & { __brand: 'StringId' }

export interface StringIds {
  clear(this: void): void
  get(this: void, literal: RoleAnnotatedStringLiteral): StringId | undefined
  getOrInsert(this: void, literal: RoleAnnotatedStringLiteral): StringId
  get size(): number
}

export const enum StringIdConstants {
  FIRST_ID = 0,

  // An arbitrarily-chosen soft limit on the maximum size of the string id map.
  SOFT_MAX_SIZE = 1000000,
}

type StringIdMap = Record<string, StringId | undefined>
type StringIdMapsByRole = Record<StringRole, StringIdMap>

export function createStringIds(): StringIds {
  const firstId = StringIdConstants.FIRST_ID as StringId
  let nextId = firstId
  let mapsByRole = createMapsByRole()

  const get = (literal: RoleAnnotatedStringLiteral): StringId | undefined => mapsByRole[literal.role][literal.string]

  return {
    clear(): void {
      if (nextId === firstId) {
        return
      }
      mapsByRole = createMapsByRole()
      nextId = firstId
    },
    get,
    getOrInsert(literal: RoleAnnotatedStringLiteral): StringId {
      // Try to reuse any existing id.
      let id = get(literal)
      if (id === undefined) {
        id = nextId++ as StringId
        mapsByRole[literal.role][literal.string] = id
      }
      return id
    },
    get size(): number {
      return nextId - firstId
    },
  }
}

function createMapsByRole(): StringIdMapsByRole {
  return {
    [StringRole.Default]: createStringIdMap(),
    [StringRole.NodeName]: createStringIdMap(),
    [StringRole.AttributeName]: createStringIdMap(),
    [StringRole.AttributeValue]: createStringIdMap(),
    [StringRole.TextContent]: createStringIdMap(),
    [StringRole.FormInput]: createStringIdMap(),
    [StringRole.Css]: createStringIdMap(),
    [StringRole.Url]: createStringIdMap(),
    [StringRole.ResourceId]: createStringIdMap(),
  }
}

function createStringIdMap(): StringIdMap {
  return Object.create(null) as StringIdMap
}
