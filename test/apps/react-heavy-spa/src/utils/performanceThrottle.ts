/**
 * Heavy computation that can be used in useMemo/useEffect
 * Returns a large array to simulate real data processing
 */
export function heavyComputation<T>(data: T[], processingTimeMs: number = 1000): T[] {
  const start = performance.now()
  let result = [...data]

  while (performance.now() - start < processingTimeMs) {
    // Simulate data processing
    result = result.map((item) => item)
    result.sort(() => Math.random() - 0.5)

    // Some computation
    result.reduce((acc) => acc + Math.random(), 0)
  }

  return result
}
