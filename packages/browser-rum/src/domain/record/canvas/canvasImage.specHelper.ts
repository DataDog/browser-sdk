// Lossy WebP encoding can shift channel values by a few units, so compare with a tolerance instead
// of an exact match.
export function expectPixelApprox(actual: number[], expected: number[]) {
  actual.forEach((value, index) => {
    expect(Math.abs(value - expected[index])).toBeLessThan(10)
  })
}
