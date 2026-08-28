/* eslint-disable id-denylist */

import type {
  AddNodeChange,
  RoleAnnotatedStringLiteral,
  StringLiteral,
  StringOrStringReference,
  StringReference,
} from '../../../types'
import { StringRole } from '../../../types'
import type { NodeId } from './itemIds'

/** The node name of an AddNode change operation, in its role-annotated form. */
export type RoleAnnotatedAddNodeName<NodeChange extends AddNodeChange> = Exclude<
  NodeChange[1],
  StringLiteral | StringReference
>

/**
 * The node-type-specific parameters of an AddNode change operation, with every string
 * in its role-annotated form.
 */
export type RoleAnnotatedAddNodeParams<NodeChange extends AddNodeChange> = NodeChange extends [
  any,
  any,
  ...infer Params,
]
  ? RoleAnnotatedParams<Params>
  : never

type RoleAnnotatedParams<Params> = { [Index in keyof Params]: RoleAnnotatedParam<Params[Index]> }

type RoleAnnotatedParam<Param> = Param extends StringOrStringReference
  ? RoleAnnotatedStringLiteral
  : RoleAnnotatedParams<Param>

/**
 * An attribute change whose strings are all annotated with their roles. The node id is a number
 * rather than a string, so it is unaffected.
 */
export type RoleAnnotatedAttributeChange = [NodeId, ...RoleAnnotatedAttributeAssignmentOrDeletion[]]

/** An attribute assignment, annotated with string roles. */
export type RoleAnnotatedAttributeAssignment = [RoleAnnotatedStringLiteral, RoleAnnotatedStringLiteral]

/** An attribute assignment or deletion, annotated with string roles. */
export type RoleAnnotatedAttributeAssignmentOrDeletion =
  [RoleAnnotatedStringLiteral, RoleAnnotatedStringLiteral] | [RoleAnnotatedStringLiteral]

/** The string literal portion of a role-annotated string literal type. */
export type RoleAnnotatedStringLiteralValue<Literal> = Literal extends RoleAnnotatedStringLiteral
  ? Literal['string']
  : never

/** The rules of a stylesheet, annotated with their roles. */
export type RoleAnnotatedStyleSheetRules = RoleAnnotatedStringLiteral | RoleAnnotatedStringLiteral[]

/** The media list of a stylesheet, annotated with their roles. */
export type RoleAnnotatedStyleSheetMediaList = RoleAnnotatedStringLiteral[]

/** Create a serialized string literal annotated with the given role. */
export function createString<Role extends StringRole, Literal extends string>(
  role: Role,
  string: Literal
): RoleAnnotatedStringLiteral & { role: Role; string: Literal } {
  return { role, string }
}

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
  'xlink:href',
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
