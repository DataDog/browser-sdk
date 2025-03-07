export const encodedContextCache: Map<unknown, string> = new Map()

export function getEncodedContext(key: unknown): string | undefined {
  if (!key || typeof key !== 'string') {
    return undefined
  }
  if (encodedContextCache.has(key)) {
    return encodedContextCache.get(key)
  }
  const encoded = encodeToUtf8Base64(key)
  encodedContextCache.set(key, encoded)
  return encoded
}

/**
 *
 * Helper function to encode a string to base64 in UTF-8
 * Comply with the `_dd.p.usr` standard and avoid non-ASCII characters
 * https://developer.mozilla.org/en-US/docs/Web/API/Window/btoa
 */
export function encodeToUtf8Base64(plainText: string) {
  const bytes = new TextEncoder().encode(plainText)
  const binString = String.fromCodePoint(...bytes)
  return btoa(binString)
}
