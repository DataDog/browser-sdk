/**
 * DSL expression language compiler for browser live debugger.
 * Compiles DSL expressions into executable JavaScript code.
 * Used by both conditions and template segments.
 * Adapted from dd-trace-js/packages/dd-trace/src/debugger/devtools_client/condition.js
 */

const identifierRegex = /^[@a-zA-Z_$][\w$]*$/

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
  | { any: ExpressionNode[] }
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
 * Compile a DSL expression node to JavaScript code
 * @param node - DSL expression node
 * @returns Compiled JavaScript code as a string, or raw primitive values
 */
export function compile(node: ExpressionNode): string | number | boolean | null {
  if (node === null || typeof node === 'number' || typeof node === 'boolean') {
    return node
  } else if (typeof node === 'string') {
    return JSON.stringify(node)
  }

  const [type, value] = Object.entries(node)[0]

  if (type === 'not') {
    return `!(${compile(value as ExpressionNode)})`
  } else if (type === 'len' || type === 'count') {
    return getSize(compile(value as ExpressionNode) as string)
  } else if (type === 'isEmpty') {
    return `${getSize(compile(value as ExpressionNode) as string)} === 0`
  } else if (type === 'isDefined') {
    return `(() => {
      try {
        ${compile(value as ExpressionNode)}
        return true
      } catch {
        return false
      }
    })()`
  } else if (type === 'instanceof') {
    const [target, typeName] = value as [ExpressionNode, string]
    return isPrimitiveType(typeName)
      ? `(typeof ${compile(target)} === '${typeName}')`
      : `Function.prototype[Symbol.hasInstance].call(${assertIdentifier(typeName)}, ${compile(target)})`
  } else if (type === 'ref') {
    const refValue = value as string
    if (refValue.startsWith('@')) {
      return '$dd_' + refValue.slice(1)
    }
    return assertIdentifier(refValue)
  } else if (Array.isArray(value)) {
    const args = value.map((v) => compile(v as ExpressionNode))
    switch (type) {
      case 'eq':
        return `(${args[0]}) === (${args[1]})`
      case 'ne':
        return `(${args[0]}) !== (${args[1]})`
      case 'gt':
        return `${guardAgainstCoercionSideEffects(args[0])} > ${guardAgainstCoercionSideEffects(args[1])}`
      case 'ge':
        return `${guardAgainstCoercionSideEffects(args[0])} >= ${guardAgainstCoercionSideEffects(args[1])}`
      case 'lt':
        return `${guardAgainstCoercionSideEffects(args[0])} < ${guardAgainstCoercionSideEffects(args[1])}`
      case 'le':
        return `${guardAgainstCoercionSideEffects(args[0])} <= ${guardAgainstCoercionSideEffects(args[1])}`
      case 'any':
        return iterateOn('some', args[0] as string, args[1] as string)
      case 'all':
        return iterateOn('every', args[0] as string, args[1] as string)
      case 'and':
        return `(${args.join(') && (')})`
      case 'or':
        return `(${args.join(') || (')})`
      case 'startsWith':
        return `String.prototype.startsWith.call(${assertString(args[0])}, ${assertString(args[1])})`
      case 'endsWith':
        return `String.prototype.endsWith.call(${assertString(args[0])}, ${assertString(args[1])})`
      case 'contains':
        return `((obj, elm) => {
          if (${isString('obj')}) {
            return String.prototype.includes.call(obj, elm)
          } else if (Array.isArray(obj)) {
            return Array.prototype.includes.call(obj, elm)
          } else if (${isTypedArray('obj')}) {
            return Object.getPrototypeOf(Int8Array.prototype).includes.call(obj, elm)
          } else if (${isInstanceOf('Set', 'obj')}) {
            return Set.prototype.has.call(obj, elm)
          } else if (${isInstanceOf('WeakSet', 'obj')}) {
            return WeakSet.prototype.has.call(obj, elm)
          } else if (${isInstanceOf('Map', 'obj')}) {
            return Map.prototype.has.call(obj, elm)
          } else if (${isInstanceOf('WeakMap', 'obj')}) {
            return WeakMap.prototype.has.call(obj, elm)
          } else {
            throw new TypeError('Variable does not support contains')
          }
        })(${args[0]}, ${args[1]})`
      case 'matches':
        return `((str, regex) => {
          if (${isString('str')}) {
            const regexIsString = ${isString('regex')}
            if (regexIsString || Object.getPrototypeOf(regex) === RegExp.prototype) {
              return RegExp.prototype.test.call(regexIsString ? new RegExp(regex) : regex, str)
            } else {
              throw new TypeError('Regular expression must be either a string or an instance of RegExp')
            }
          } else {
            throw new TypeError('Variable is not a string')
          }
        })(${args[0]}, ${args[1]})`
      case 'filter':
        return `(($dd_var) => {
          return ${isIterableCollection('$dd_var')}
            ? Array.from($dd_var).filter(($dd_it) => ${args[1]})
            : Object.entries($dd_var).reduce((acc, [$dd_key, $dd_value]) => {
                if (${args[1]}) acc[$dd_key] = $dd_value
                return acc
              }, {})
        })(${args[0]})`
      case 'substring':
        return `((str) => {
          if (${isString('str')}) {
            return String.prototype.substring.call(str, ${args[1]}, ${args[2]})
          } else {
            throw new TypeError('Variable is not a string')
          }
        })(${args[0]})`
      case 'getmember':
        return accessProperty(args[0] as string, args[1] as string, false)
      case 'index':
        return accessProperty(args[0] as string, args[1] as string, true)
    }
  }

  throw new TypeError(`Unknown AST node type: ${type}`)
}

function iterateOn(fnName: string, variable: string, callbackCode: string): string {
  return `(($dd_val) => {
    return ${isIterableCollection('$dd_val')}
      ? Array.from($dd_val).${fnName}(($dd_it) => ${callbackCode})
      : Object.entries($dd_val).${fnName}(([$dd_key, $dd_value]) => ${callbackCode})
  })(${variable})`
}

function isString(variable: string): string {
  return `(typeof ${variable} === 'string' || ${variable} instanceof String)`
}

function isPrimitiveType(type: string): boolean {
  return PRIMITIVE_TYPES.has(type)
}

function isIterableCollection(variable: string): string {
  return (
    `(${isArrayOrTypedArray(variable)} || ${isInstanceOf('Set', variable)} || ` +
    `${isInstanceOf('WeakSet', variable)})`
  )
}

function isArrayOrTypedArray(variable: string): string {
  return `(Array.isArray(${variable}) || ${isTypedArray(variable)})`
}

function isTypedArray(variable: string): string {
  return `(${variable} instanceof Object.getPrototypeOf(Int8Array))`
}

function isInstanceOf(type: string, variable: string): string {
  return `(${variable} instanceof ${type})`
}

function getSize(variable: string): string {
  return `((val) => {
    if (${isString('val')} || ${isArrayOrTypedArray('val')}) {
      return ${guardAgainstPropertyAccessSideEffects('val', '"length"')}
    } else if (${isInstanceOf('Set', 'val')} || ${isInstanceOf('Map', 'val')}) {
      return ${guardAgainstPropertyAccessSideEffects('val', '"size"')}
    } else if (${isInstanceOf('WeakSet', 'val')} || ${isInstanceOf('WeakMap', 'val')}) {
      throw new TypeError('Cannot get size of WeakSet or WeakMap')
    } else if (typeof val === 'object' && val !== null) {
      return Object.keys(val).length
    } else {
      throw new TypeError('Cannot get length of variable')
    }
  })(${variable})`
}

function accessProperty(variable: string, keyOrIndex: string, allowMapAccess: boolean): string {
  return `((val, key) => {
    if (${isInstanceOf('Map', 'val')}) {
      ${allowMapAccess ? 'return Map.prototype.get.call(val, key)' : "throw new Error('Accessing a Map is not allowed')"}
    } else if (${isInstanceOf('WeakMap', 'val')}) {
      ${allowMapAccess ? 'return WeakMap.prototype.get.call(val, key)' : "throw new Error('Accessing a WeakMap is not allowed')"}
    } else if (${isInstanceOf('Set', 'val')} || ${isInstanceOf('WeakSet', 'val')}) {
      throw new Error('Accessing a Set or WeakSet is not allowed')
    } else {
      return ${guardAgainstPropertyAccessSideEffects('val', 'key')}
    }
  })(${variable}, ${keyOrIndex})`
}

function guardAgainstPropertyAccessSideEffects(variable: string, propertyName: string): string {
  return `((val, key) => {
    if (Object.getOwnPropertyDescriptor(val, key)?.get !== undefined) {
      throw new Error('Possibility of side effect')
    } else {
      return val[key]
    }
  })(${variable}, ${propertyName})`
}

function guardAgainstCoercionSideEffects(variable: string | number | boolean | null): string {
  // shortcut if we're comparing number literals
  if (typeof variable === 'number') return String(variable)

  return `((val) => {
    if (
      typeof val === 'object' && val !== null && (
        val[Symbol.toPrimitive] !== undefined ||
        val.valueOf !== Object.prototype.valueOf ||
        val.toString !== Object.prototype.toString
      )
    ) {
      throw new Error('Possibility of side effect due to coercion methods')
    } else {
      return val
    }
  })(${variable})`
}

function assertString(variable: string | number | boolean | null): string {
  return `((val) => {
    if (${isString('val')}) {
      return val
    } else {
      throw new TypeError('Variable is not a string')
    }
  })(${variable})`
}

function assertIdentifier(value: string): string {
  if (!identifierRegex.test(value) || reservedWords.has(value)) {
    throw new SyntaxError(`Illegal identifier: ${value}`)
  }
  return value
}
