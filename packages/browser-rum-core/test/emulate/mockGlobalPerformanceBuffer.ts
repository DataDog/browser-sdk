import { vi } from 'vitest'

export interface GlobalPerformanceBufferMock {
  addPerformanceEntry: (entry: PerformanceEntry) => void
}

export function mockGlobalPerformanceBuffer(initialEntries: PerformanceEntry[] = []): GlobalPerformanceBufferMock {
  const performanceEntries: PerformanceEntry[] = initialEntries

  vi.spyOn(performance, 'getEntries').mockImplementation(() => performanceEntries.slice())
  vi.spyOn(performance, 'getEntriesByName').mockImplementation((name) =>
    performanceEntries.filter((entry) => entry.name === name)
  )
  vi.spyOn(performance, 'getEntriesByType').mockImplementation((type) =>
    performanceEntries.filter((entry) => entry.entryType === type)
  )

  return {
    addPerformanceEntry: (entry) => performanceEntries.push(entry),
  }
}
