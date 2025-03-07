export const encodedContextCache: { [key: string]: string } = {}

export function getEncodedContext(key: unknown, encoder: (plainText: string) => string): string | undefined {
  if (!key || typeof key !== 'string') {
    return undefined
  }
  if (encodedContextCache[key]) {
    return encodedContextCache[key]
  }
  const encoded = encoder(key)
  encodedContextCache[key] = encoded
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
