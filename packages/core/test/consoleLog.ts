const ignoreList: Array<{ level: string; match: string }> = []

afterEach(() => {
  ignoreList.length = 0
})

/**
 * Ignore console logs that match the given level and message for the duration of the test. This
 * function can be called multiple times to ignore multiple logs.
 */
export function ignoreConsoleLogs(level: 'error' | 'warn' | 'log', match: string) {
  ignoreList.push({ level, match })

  if (!jasmine.isSpy(console[level])) {
    const originalLogFunction = console[level].bind(console)

    spyOn(console, level).and.callFake((...args: unknown[]) => {
      // No need to be too precise with formating here, we just want something to match against
      const message = args.map((arg) => String(arg)).join(' ')
      if (ignoreList.some((ignoreEntry) => ignoreEntry.level === level && message.includes(ignoreEntry.match))) {
        return
      }
      originalLogFunction(...args)
    })
  }
}
