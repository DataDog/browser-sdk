import type { InitConfiguration } from '@datadog/browser-core'
import { getCookie, display } from '@datadog/browser-core'

import { parseJsonPath } from '../jsonPathParser'

interface RemoteConfiguration extends Record<(typeof SUPPORTED_FIELDS)[number], any> {}

// XOR for exactly one of n types
type XOR<T extends any[]> = T extends [infer Only]
  ? Only
  : T extends [infer First, infer Second, ...infer Rest]
    ? XOR<[XORHelper<First, Second>, ...Rest]>
    : never

// Helper: XOR for two types
type XORHelper<T, U> =
  | (T & { [K in Exclude<keyof U, keyof T>]?: never })
  | (U & { [K in Exclude<keyof T, keyof U>]?: never })

interface SerializedCookieStrategy {
  name: string
  strategy: 'cookie'
}
interface SerializedDOMStrategy {
  attribute?: string
  selector: string
  strategy: 'dom'
}
interface SerializedJSStrategy {
  path: string
  strategy: 'js'
}
type SerializedDynamic = { rcSerializedType: 'dynamic' } & SerializedExtractor & SerializedDynamicStrategy
type SerializedDynamicStrategy = XOR<[SerializedCookieStrategy, SerializedDOMStrategy, SerializedJSStrategy]>
interface SerializedExtractor {
  extractor?: SerializedRegex
}
interface SerializedRegex {
  rcSerializedType: 'regex'
  value: string
}
interface SerializedString {
  rcSerializedType: 'string'
  value: string
}
type SerializedOption = SerializedString | SerializedRegex | SerializedDynamic

const SUPPORTED_FIELDS = [
  'allowedTracingUrls',
  'allowedTrackingOrigins',
  'applicationId',
  'clientToken',
  'defaultPrivacyLevel',
  'enablePrivacyForActionName',
  'env',
  'service',
  'sessionReplaySampleRate',
  'sessionSampleRate',
  'traceSampleRate',
  'trackSessionAcrossSubdomains',
  'version',
] as const

function isForbiddenElementAttribute(element: Element, attribute: string) {
  return element instanceof HTMLInputElement && element.getAttribute('type') === 'password' && attribute === 'value'
}

function isObject(property: unknown): property is { [key: string]: unknown } {
  return typeof property === 'object' && property !== null
}

function isSerializedOption(value: object): value is SerializedOption {
  return 'rcSerializedType' in value
}

function mapValues<O extends Record<string, unknown>, R>(
  object: O,
  fn: (value: O[keyof O]) => R
): { [K in keyof O]: R } {
  const entries = Object.entries(object) as Array<[keyof O, O[keyof O]]>

  return Object.fromEntries(entries.map(([key, value]) => [key, fn(value)])) as { [K in keyof O]: R }
}

function resolveCookie<O extends SerializedCookieStrategy>(option: O) {
  return getCookie(option.name)
}

function resolveDOM<O extends SerializedDOMStrategy>(option: O) {
  const { attribute, selector } = option

  let element: Element | null = null
  try {
    element = document.querySelector(selector)
  } catch {
    display.error(`Invalid selector in the remote configuration: '${selector}'`)
  }

  if (!element) {
    return
  }

  if (attribute && isForbiddenElementAttribute(element, attribute)) {
    display.error(`Forbidden element selected by the remote configuration: '${selector}'`)
    return
  }

  return attribute !== undefined ? element.getAttribute(attribute) : element.textContent
}

function resolveJS<O extends SerializedJSStrategy>(option: O) {
  const { path } = option
  const keys = parseJsonPath(path)

  if (keys.length === 0) {
    display.error(`Invalid JSON path in the remote configuration: '${path}'`)
    return
  }

  try {
    return keys.reduce(
      (current, key) => {
        if (!(key in current)) {
          throw new Error('Unknown key')
        }

        return current[key] as Record<string, unknown>
      },
      window as unknown as Record<string, unknown>
    )
  } catch (error) {
    display.error(`Error accessing: '${path}'`, error)
    return
  }
}

function resolveDynamic(option: SerializedDynamic) {
  const { strategy } = option

  switch (strategy) {
    case 'cookie':
      return () => resolveCookie(option)

    case 'dom':
      return () => resolveDOM(option)

    case 'js':
      return () => resolveJS(option)
  }
}

function resolve(property: unknown): any {
  if (Array.isArray(property)) {
    return property.map(resolve)
  }

  if (isObject(property)) {
    if (isSerializedOption(property)) {
      const { rcSerializedType: type } = property

      switch (type) {
        case 'string':
          return property.value

        case 'regex':
          try {
            return new RegExp(property.value)
          } catch {
            display.error(`Invalid regex in the remote configuration: '${property.value}'`)
            // Return a regex that never matches anything
            return /(?!)/
          }

        case 'dynamic':
          return resolveDynamic(property)
      }
    }

    return mapValues(property, resolve)
  }

  return property
}

function process(config: RemoteConfiguration): InitConfiguration {
  return mapValues(config, resolve)
}

export type { RemoteConfiguration }
export { process }
