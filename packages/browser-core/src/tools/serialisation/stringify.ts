import { jsonStringify } from '@datadog/js-core/util'
import { sanitize } from './sanitize'

export function safeToString(value: unknown): string | undefined {
  try {
    return String(value)
  } catch {
    // ignore
  }
}

export function safeStringify(value: unknown): string | undefined {
  try {
    return jsonStringify(sanitize(value))
  } catch {
    // ignore
  }
}
