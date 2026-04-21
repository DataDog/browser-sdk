let cachedTimeZone: string | undefined | null = null

export function getTimeZone() {
  if (cachedTimeZone === null) {
    try {
      cachedTimeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      cachedTimeZone = undefined
    }
  }
  return cachedTimeZone
}
