// Some browsers (e.g. older Firefox/Safari versions) don't support encoding canvases as WebP and
// silently fall back to PNG, as mandated by the spec for unsupported `toBlob`/`toDataURL` types.
export function supportsWebPEncoding(): boolean {
  return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp')
}

// Lossy WebP encoding can shift channel values by a few units, so compare with a tolerance instead
// of an exact match.
export function expectPixelApprox(actual: number[], expected: number[]) {
  actual.forEach((value, index) => {
    expect(Math.abs(value - expected[index])).toBeLessThan(10)
  })
}
