export function getTimeZone() {
  try {
    const intl = new Intl.DateTimeFormat()

    return intl.resolvedOptions().timeZone
  } catch {
    return undefined
  }
}
