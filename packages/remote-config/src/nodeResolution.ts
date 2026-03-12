import { display, isIndexableObject } from '@datadog/browser-core'
import type { DynamicOption, ContextItem } from './remoteConfiguration.types'

// ---------------------------------------------------------------------------
// CodeExpression — internal marker for raw JS code strings
// ---------------------------------------------------------------------------

export interface CodeExpression {
  __isCodeExpression: true
  code: string
}

export function codeExpression(code: string): CodeExpression {
  return { __isCodeExpression: true, code }
}

export function isCodeExpression(value: unknown): value is CodeExpression {
  return isIndexableObject(value) && (value as unknown as CodeExpression).__isCodeExpression === true
}

// ---------------------------------------------------------------------------
// serializeDynamicValueToJs
// ---------------------------------------------------------------------------

/**
 * Serialize a string as a single-quoted JS string literal.
 * Escapes backslashes and single quotes so the result is valid JS.
 */
function jsStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export function serializeDynamicValueToJs(option: DynamicOption): string {
  let expr: string
  switch (option.strategy) {
    case 'cookie':
      expr = `__dd_getCookie(${jsStringLiteral(option.name)})`
      break
    case 'js':
      expr = `__dd_getJs(${jsStringLiteral(option.path)})`
      break
    case 'dom':
      expr =
        option.attribute !== undefined
          ? `__dd_getDomAttr(${jsStringLiteral(option.selector)},${jsStringLiteral(option.attribute)})`
          : `__dd_getDomText(${jsStringLiteral(option.selector)})`
      break
    case 'localStorage':
      expr = `__dd_getLocalStorage(${jsStringLiteral(option.key)})`
      break
    default:
      display.warn(`Unsupported remote configuration strategy: "${(option as DynamicOption).strategy}"`)
      return 'undefined'
  }

  if (option.extractor !== undefined) {
    expr = `__dd_extract(${expr},${jsStringLiteral(option.extractor.value)})`
  }

  return expr
}

// ---------------------------------------------------------------------------
// nodeContextItemHandler and serializeConfigToJs — implemented in Task 2
// ---------------------------------------------------------------------------

/** @internal */
export function nodeContextItemHandler(items: ContextItem[], resolve: (value: unknown) => unknown): unknown {
  const entries = items
    .map(({ key, value }) => {
      if (value === undefined) return null
      const resolved = resolve(value)
      if (resolved === undefined) return null
      const code = isCodeExpression(resolved) ? resolved.code : JSON.stringify(resolved)
      return `${JSON.stringify(key)}: ${code}`
    })
    .filter((entry): entry is string => entry !== null)

  return codeExpression(`{ ${entries.join(', ')} }`)
}

export function serializeConfigToJs(config: unknown): string {
  if (isCodeExpression(config)) {
    return config.code
  }
  if (Array.isArray(config)) {
    return `[${config.map(serializeConfigToJs).join(', ')}]`
  }
  if (isIndexableObject(config)) {
    const entries = Object.entries(config as Record<string, unknown>).map(
      ([k, v]) => `${JSON.stringify(k)}: ${serializeConfigToJs(v)}`
    )
    return `{ ${entries.join(', ')} }`
  }
  return JSON.stringify(config)
}
