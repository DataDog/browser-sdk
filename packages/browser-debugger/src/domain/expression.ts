/**
 * DSL expression language for Live Debugger SDK.
 * Compiles DSL expressions into functions that evaluate them against the runtime context of a probe.
 * Used by conditions, template segments, and capture expressions.
 * Adapted from dd-trace-js/packages/dd-trace/src/debugger/devtools_client/condition.js. dd-trace-js generates
 * JavaScript source because the inspector protocol needs it. Evaluating the expression tree directly instead lets
 * the SDK run on pages whose Content Security Policy doesn't allow 'unsafe-eval'.
 */

import { globalObject } from '@datadog/js-core/util'

const identifierRegex = /^(@[\w$]+|[a-zA-Z_$][\w$]*)$/

// The following identifiers have purposefully not been included in this list:
// - The reserved words `this` and `super` as they can have valid use cases as `ref` values
// - The literals `undefined` and `Infinity` as they can be useful as `ref` values, especially to check if a
//   variable is `undefined`.
// - The following future reserved words in older standards, as they can now be used safely:
//   `abstract`, `boolean`, `byte`, `char`, `double`, `final`, `float`, `goto`, `int`, `long`, `native`, `short`,
//   `synchronized`, `throws`, `transient`, `volatile`.
const reservedWords = new Set([
  // Reserved words
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'switch',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',

  // Reserved in strict mode
  'let',
  'static',
  'yield',

  // Reserved in module code or async function bodies:
  'await',

  // Future reserved words
  'enum',

  // Future reserved words in strict mode
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',

  // Literals
  'NaN',
])

const PRIMITIVE_TYPES = new Set(['string', 'number', 'bigint', 'boolean', 'undefined', 'symbol', 'null'])

export type ExpressionNode =
  | null
  | string
  | number
  | boolean
  | { not: ExpressionNode }
  | { len: ExpressionNode }
  | { count: ExpressionNode }
  | { isEmpty: ExpressionNode }
  | { isDefined: ExpressionNode }
  | { instanceof: [ExpressionNode, string] }
  | { ref: string }
  | { eq: ExpressionNode[] }
  | { ne: ExpressionNode[] }
  | { gt: ExpressionNode[] }
  | { ge: ExpressionNode[] }
  | { lt: ExpressionNode[] }
  | { le: ExpressionNode[] }
  | { any: ExpressionNode[] } // eslint-disable-line id-denylist
  | { all: ExpressionNode[] }
  | { and: ExpressionNode[] }
  | { or: ExpressionNode[] }
  | { startsWith: ExpressionNode[] }
  | { endsWith: ExpressionNode[] }
  | { contains: ExpressionNode[] }
  | { matches: ExpressionNode[] }
  | { filter: ExpressionNode[] }
  | { substring: ExpressionNode[] }
  | { getmember: ExpressionNode[] }
  | { index: ExpressionNode[] }

/**
 * Evaluate an expression against a runtime context, where the `this` key holds the receiver
 */
export type CompiledExpression = (context: Record<string, unknown>) => unknown

/**
 * Variables visible to an expression: the runtime context, then the bindings of each enclosing `any`, `all` or
 * `filter` operation (`$dd_it`, or `$dd_key` and `$dd_value`)
 */
interface Scope {
  variables: Record<string, unknown>
  parent?: Scope
}

type Evaluator = (scope: Scope) => unknown

/**
 * Compile a DSL expression node into a function that evaluates it
 *
 * @param node - DSL expression node
 * @returns Function evaluating the expression against a runtime context
 * @throws SyntaxError for illegal identifiers, and TypeError for unknown or malformed nodes
 */
export function compile(node: ExpressionNode): CompiledExpression {
  const evaluate = compileNode(node)
  return (context) => evaluate({ variables: context })
}

function compileNode(node: ExpressionNode): Evaluator {
  if (node === null || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return () => node
  }

  const [type, value] = Object.entries(node)[0]

  if (type === 'not') {
    const operand = compileNode(value as ExpressionNode)
    return (scope) => !operand(scope)
  } else if (type === 'len' || type === 'count') {
    const operand = compileNode(value as ExpressionNode)
    return (scope) => getSize(operand(scope))
  } else if (type === 'isEmpty') {
    const operand = compileNode(value as ExpressionNode)
    return (scope) => getSize(operand(scope)) === 0
  } else if (type === 'isDefined') {
    const operand = compileNode(value as ExpressionNode)
    return (scope) => {
      try {
        operand(scope)
        return true
      } catch {
        return false
      }
    }
  } else if (type === 'instanceof') {
    const [target, typeName] = value as [ExpressionNode, string]
    if (isPrimitiveType(typeName)) {
      const operand = compileTypeofOperand(target)
      return (scope) => typeof operand(scope) === typeName
    }
    const getType = compileReference(typeName)
    const operand = compileNode(target)
    return (scope) => Function.prototype[Symbol.hasInstance].call(getType(scope), operand(scope))
  } else if (type === 'ref') {
    return compileReference(value as string)
  } else if (Array.isArray(value)) {
    const args = (value as ExpressionNode[]).map((arg) => compileNode(arg))
    // As in dd-trace-js, missing operands evaluate to `undefined`
    const [first = evaluateUndefined, second = evaluateUndefined, third = evaluateUndefined] = args
    switch (type) {
      case 'eq':
        return (scope) => first(scope) === second(scope)
      case 'ne':
        return (scope) => first(scope) !== second(scope)
      case 'gt':
        return compileComparison(first, second, (left, right) => left > right)
      case 'ge':
        return compileComparison(first, second, (left, right) => left >= right)
      case 'lt':
        return compileComparison(first, second, (left, right) => left < right)
      case 'le':
        return compileComparison(first, second, (left, right) => left <= right)
      case 'any':
        return (scope) => iterateOn('some', first(scope), second, scope)
      case 'all':
        return (scope) => iterateOn('every', first(scope), second, scope)
      case 'and':
        return (scope) => {
          let result: unknown = true
          for (const arg of args) {
            result = arg(scope)
            if (!result) {
              break
            }
          }
          return result
        }
      case 'or':
        return (scope) => {
          let result: unknown = false
          for (const arg of args) {
            result = arg(scope)
            if (result) {
              break
            }
          }
          return result
        }
      case 'startsWith':
        return (scope) => String.prototype.startsWith.call(assertString(first(scope)), assertString(second(scope)))
      case 'endsWith':
        return (scope) => String.prototype.endsWith.call(assertString(first(scope)), assertString(second(scope)))
      case 'contains':
        return (scope) => contains(first(scope), second(scope))
      case 'matches':
        return (scope) => matches(first(scope), second(scope))
      case 'filter':
        return (scope) => filter(first(scope), second, scope)
      case 'substring':
        return (scope) => {
          const str = first(scope)
          if (!isString(str)) {
            throw new TypeError('Variable is not a string')
          }
          return String.prototype.substring.call(str as string, second(scope) as number, third(scope) as number)
        }
      case 'getmember':
        return (scope) => accessProperty(first(scope), second(scope), false)
      case 'index':
        return (scope) => accessProperty(first(scope), second(scope), true)
    }
  }

  throw new TypeError(`Unknown AST node type: ${type}`)
}

function evaluateUndefined(): undefined {
  return undefined
}

/**
 * Compile a reference, resolved like a JavaScript identifier: in the innermost iteration bindings first, then in the
 * context, then on the global object
 */
function compileReference(identifier: string, isTypeofOperand = false): Evaluator {
  const name = toVariableName(assertIdentifier(identifier))
  return (scope) => {
    for (let current: Scope | undefined = scope; current; current = current.parent) {
      if (Object.prototype.hasOwnProperty.call(current.variables, name)) {
        return current.variables[name]
      }
    }
    if (name in globalObject) {
      return (globalObject as unknown as Record<string, unknown>)[name]
    }
    if (isTypeofOperand) {
      return undefined
    }
    throw new ReferenceError(`${name} is not defined`)
  }
}

// Like JavaScript's `typeof`, don't throw on a reference to an undeclared variable
function compileTypeofOperand(node: ExpressionNode): Evaluator {
  if (node !== null && typeof node === 'object' && 'ref' in node) {
    return compileReference(node.ref, true)
  }
  return compileNode(node)
}

function toVariableName(identifier: string): string {
  return identifier.startsWith('@') ? `$dd_${identifier.slice(1)}` : identifier
}

function compileComparison(
  first: Evaluator,
  second: Evaluator,
  compare: (left: any, right: any) => boolean
): Evaluator {
  return (scope) => {
    const left = guardAgainstCoercionSideEffects(first(scope))
    const right = guardAgainstCoercionSideEffects(second(scope))
    return compare(left, right)
  }
}

function iterateOn(method: 'some' | 'every', collection: unknown, predicate: Evaluator, scope: Scope): boolean {
  if (isIterableCollection(collection)) {
    const evaluateItem = createItemPredicate(predicate, scope)
    return Array.from(collection as Iterable<unknown>)[method](evaluateItem)
  }
  const evaluateEntry = createEntryPredicate(predicate, scope)
  return Object.entries(collection as object)[method](evaluateEntry)
}

function filter(collection: unknown, predicate: Evaluator, scope: Scope): unknown {
  if (isIterableCollection(collection)) {
    return Array.from(collection as Iterable<unknown>).filter(createItemPredicate(predicate, scope))
  }
  const evaluateEntry = createEntryPredicate(predicate, scope)
  return Object.entries(collection as object).reduce<Record<string, unknown>>((acc, entry) => {
    if (evaluateEntry(entry)) {
      acc[entry[0]] = entry[1]
    }
    return acc
  }, {})
}

// Predicates run synchronously and nothing keeps a reference to their scope, so all the items of a collection share one
function createItemPredicate(predicate: Evaluator, parent: Scope): (item: unknown) => unknown {
  const variables: Record<string, unknown> = { $dd_it: undefined }
  const scope: Scope = { variables, parent }
  return (item) => {
    variables.$dd_it = item
    return predicate(scope)
  }
}

function createEntryPredicate(predicate: Evaluator, parent: Scope): (entry: [string, unknown]) => unknown {
  const variables: Record<string, unknown> = { $dd_key: undefined, $dd_value: undefined }
  const scope: Scope = { variables, parent }
  return ([key, value]) => {
    variables.$dd_key = key
    variables.$dd_value = value
    return predicate(scope)
  }
}

function contains(obj: unknown, elm: unknown): boolean {
  if (isString(obj)) {
    return String.prototype.includes.call(obj as string, elm as string)
  } else if (Array.isArray(obj)) {
    return Array.prototype.includes.call(obj, elm)
  } else if (isTypedArray(obj)) {
    return (Object.getPrototypeOf(Int8Array.prototype) as Int8Array).includes.call(obj as Int8Array, elm as number)
  } else if (obj instanceof Set) {
    return Set.prototype.has.call(obj, elm)
  } else if (obj instanceof WeakSet) {
    return WeakSet.prototype.has.call(obj, elm as object)
  } else if (obj instanceof Map) {
    return Map.prototype.has.call(obj, elm)
  } else if (obj instanceof WeakMap) {
    return WeakMap.prototype.has.call(obj, elm as object)
  }
  throw new TypeError('Variable does not support contains')
}

function matches(str: unknown, regex: unknown): boolean {
  if (!isString(str)) {
    throw new TypeError('Variable is not a string')
  }
  const regexIsString = isString(regex)
  if (!regexIsString && Object.getPrototypeOf(regex) !== RegExp.prototype) {
    throw new TypeError('Regular expression must be either a string or an instance of RegExp')
  }
  return RegExp.prototype.test.call(regexIsString ? new RegExp(regex as string) : (regex as RegExp), str as string)
}

function isString(value: unknown): boolean {
  return typeof value === 'string' || value instanceof String
}

function isPrimitiveType(type: string): boolean {
  return PRIMITIVE_TYPES.has(type)
}

function isIterableCollection(value: unknown): boolean {
  return isArrayOrTypedArray(value) || value instanceof Set || value instanceof WeakSet
}

function isArrayOrTypedArray(value: unknown): boolean {
  return Array.isArray(value) || isTypedArray(value)
}

function isTypedArray(value: unknown): boolean {
  return value instanceof Object.getPrototypeOf(Int8Array)
}

function getSize(value: unknown): unknown {
  if (isString(value) || isArrayOrTypedArray(value)) {
    return getPropertyWithoutSideEffects(value, 'length')
  } else if (value instanceof Set || value instanceof Map) {
    return getPropertyWithoutSideEffects(value, 'size')
  } else if (value instanceof WeakSet || value instanceof WeakMap) {
    throw new TypeError('Cannot get size of WeakSet or WeakMap')
  } else if (typeof value === 'object' && value !== null) {
    return Object.keys(value).length
  }
  throw new TypeError('Cannot get length of variable')
}

function accessProperty(value: unknown, key: unknown, allowMapAccess: boolean): unknown {
  if (value instanceof Map) {
    if (allowMapAccess) {
      return Map.prototype.get.call(value, key)
    }
    throw new Error('Accessing a Map is not allowed')
  } else if (value instanceof WeakMap) {
    if (allowMapAccess) {
      return WeakMap.prototype.get.call(value, key as object)
    }
    throw new Error('Accessing a WeakMap is not allowed')
  } else if (value instanceof Set || value instanceof WeakSet) {
    throw new Error('Accessing a Set or WeakSet is not allowed')
  }
  return getPropertyWithoutSideEffects(value, key)
}

function getPropertyWithoutSideEffects(value: unknown, key: unknown): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key as PropertyKey)
  if (descriptor?.get !== undefined) {
    throw new Error('Possibility of side effect')
  }
  return (value as Record<PropertyKey, unknown>)[key as PropertyKey]
}

function guardAgainstCoercionSideEffects(value: unknown): unknown {
  if (typeof value === 'object' && value !== null) {
    const coercible = value as { [Symbol.toPrimitive]?: unknown; valueOf?: unknown; toString?: unknown }
    if (
      coercible[Symbol.toPrimitive] !== undefined ||
      coercible.valueOf !== Object.prototype.valueOf ||
      coercible.toString !== Object.prototype.toString
    ) {
      throw new Error('Possibility of side effect due to coercion methods')
    }
  }
  return value
}

function assertString(value: unknown): string {
  if (!isString(value)) {
    throw new TypeError('Variable is not a string')
  }
  return value as string
}

function assertIdentifier(value: string): string {
  if (!identifierRegex.test(value) || reservedWords.has(value)) {
    throw new SyntaxError(`Illegal identifier: ${value}`)
  }
  return value
}
