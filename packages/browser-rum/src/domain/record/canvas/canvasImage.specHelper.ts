export function bitmapPixels(bitmap: ImageBitmap): number[] {
  const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  return Array.from(context.getImageData(0, 0, bitmap.width, bitmap.height).data)
}

// Lossy WebP encoding can shift channel values by a few units, so compare with a tolerance instead
// of an exact match.
export function expectPixelApprox(actual: number[], expected: number[]) {
  actual.forEach((value, index) => {
    expect(Math.abs(value - expected[index])).toBeLessThan(10)
  })
}
