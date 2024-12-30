export interface GlobalPerformanceBufferMock {
  addPerformanceEntry: (entry: PerformanceEntry) => void
}

export function mockGlobalPerformanceBuffer(initialEntries: PerformanceEntry[] = []): GlobalPerformanceBufferMock {
  const performanceEntries: PerformanceEntry[] = initialEntries

  spyOn(performance, 'getEntries').and.callFake(() => performanceEntries.slice())
  spyOn(performance, 'getEntriesByName').and.callFake((name) =>
    performanceEntries.filter((entry) => entry.name === name)
  )
  spyOn(performance, 'getEntriesByType').and.callFake((type) =>
    performanceEntries.filter((entry) => entry.entryType === type)
  )

  return {
    addPerformanceEntry: (entry) => performanceEntries.push(entry),
  }
}
