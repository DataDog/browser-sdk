/* eslint-disable id-denylist */

import type { RoleAnnotatedStringLiteral } from '../../../types'
import { StringRole } from '../../../types'

/** Create a serialized string literal annotated with the given role. */
export function createString<Role extends StringRole, Literal extends string>(
  role: Role,
  string: Literal
): RoleAnnotatedStringLiteral & { role: Role; string: Literal } {
  return { role, string }
}

export type RoleAnnotatedAttributeAssignment = [RoleAnnotatedStringLiteral, RoleAnnotatedStringLiteral]

/** Create a serialized attribute assignment annotated with the appropriate roles. */
export function createAttributeAssignment(
  attributeName: string,
  attributeValue: string
): RoleAnnotatedAttributeAssignment {
  return [
    createString(StringRole.AttributeName, attributeName),
    createString(attributeValueRole(attributeName), attributeValue),
  ]
}

export type RoleAnnotatedAttributeAssignmentOrDeletion =
  [RoleAnnotatedStringLiteral, RoleAnnotatedStringLiteral] | [RoleAnnotatedStringLiteral]

/** Create a serialized attribute assignment or deletion annotated with the appropriate roles. */
export function createAttributeAssignmentOrDeletion(
  attributeName: string,
  attributeValue: string | null
): RoleAnnotatedAttributeAssignmentOrDeletion {
  const name = createString(StringRole.AttributeName, attributeName)

  if (attributeValue === null) {
    return [name]
  }

  return [name, createString(attributeValueRole(attributeName), attributeValue)]
}

/** Attributes whose value is a URL or a list of URLs. */
const URL_ATTRIBUTE_NAMES = new Set([
  'action',
  'background',
  'cite',
  'data',
  'formaction',
  'href',
  'longdesc',
  'manifest',
  'ping',
  'poster',
  'src',
  'srcset',
])

/** The role that the value of the given attribute plays. */
function attributeValueRole(attributeName: string): StringRole {
  switch (attributeName) {
    case 'value':
      return StringRole.FormInput
    case 'style':
      return StringRole.Css
    default:
      return URL_ATTRIBUTE_NAMES.has(attributeName) ? StringRole.Url : StringRole.AttributeValue
  }
}
