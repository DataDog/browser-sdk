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

/**
 * Given a normalized tag name, an attribute name, and an attribute value, returns a
 * serialized attribute assignment annotated with the appropriate roles.
 */
export function createAttributeAssignment(
  tagName: string,
  attributeName: string,
  attributeValue: string
): RoleAnnotatedAttributeAssignment {
  return [
    createString(StringRole.AttributeName, attributeName),
    createString(attributeValueRole(tagName, attributeName), attributeValue),
  ]
}

export type RoleAnnotatedAttributeAssignmentOrDeletion =
  [RoleAnnotatedStringLiteral, RoleAnnotatedStringLiteral] | [RoleAnnotatedStringLiteral]

/**
 * Given a normalized tag name, an attribute name, and an attribute value, returns a
 * serialized attribute assignment or deletion annotated with the appropriate roles.
 */
export function createAttributeAssignmentOrDeletion(
  tagName: string,
  attributeName: string,
  attributeValue: string | null
): RoleAnnotatedAttributeAssignmentOrDeletion {
  const name = createString(StringRole.AttributeName, attributeName)

  if (attributeValue === null) {
    return [name]
  }

  return [name, createString(attributeValueRole(tagName, attributeName), attributeValue)]
}

/**
 * Elements whose `value` attribute holds form input. Every other element that carries a `value`
 * attribute — `<li>`, `<button>`, `<meter>`, `<param>`, and the rest — holds an ordinary attribute
 * value there, and masking it would change how the page renders rather than hide anything private.
 */
const FORM_ELEMENT_NAMES = new Set(['input', 'option', 'select', 'textarea'])

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

/** The role that the value of the given attribute plays on the given element. */
function attributeValueRole(tagName: string, attributeName: string): StringRole {
  switch (attributeName) {
    case 'value':
      return FORM_ELEMENT_NAMES.has(tagName) ? StringRole.FormInput : StringRole.AttributeValue
    case 'style':
      return StringRole.Css
    default:
      return URL_ATTRIBUTE_NAMES.has(attributeName) ? StringRole.Url : StringRole.AttributeValue
  }
}
